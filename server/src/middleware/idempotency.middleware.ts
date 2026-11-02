import { Request, Response, NextFunction } from 'express';
import { idempotencyService } from '../services/idempotency.service.js';
import { AppHttpError, BadRequestError, ConflictError, UnauthorizedError } from '../utils/errors.js';

export interface IdempotencyOptions {
  required?: boolean;
  ttlSeconds?: number;
}

/**
 * Production-style Idempotency Middleware (Stripe/Ticketmaster standard)
 * 
 * Guarantees:
 * 1. Mutual Exclusion: Blocks simultaneous in-flight duplicate requests with 409 Conflict.
 * 2. Response Replay: Returns exact cached status & payload with `Idempotent-Replayed: true`.
 * 3. Tampering Prevention: Rejects reused key with altered payload with 422 Unprocessable Entity.
 * 4. Dual-Tier Storage: Redis fast tier + PostgreSQL durable audit records.
 */
export function idempotency(options: IdempotencyOptions = {}) {
  const { required = false, ttlSeconds = 86400 } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // 1. Extract Idempotency Key from headers or body
    const headerKey = req.header('Idempotency-Key') || req.header('X-Idempotency-Key');
    const bodyKey = typeof req.body?.idempotency_key === 'string' ? req.body.idempotency_key : undefined;
    const key = (headerKey || bodyKey)?.trim();

    if (!key) {
      if (required) {
        return next(new BadRequestError('Idempotency-Key header is required for this operation'));
      }
      return next();
    }

    if (key.length > 255) {
      return next(new BadRequestError('Idempotency-Key must not exceed 255 characters'));
    }

    const userId = req.user?.userId;
    if (!userId) {
      return next(new UnauthorizedError('Authentication required to use idempotency keys'));
    }

    // Attach key to request for downstream service consumption
    req.idempotencyKey = key;

    const requestPath = req.baseUrl + req.path;
    const currentHash = idempotencyService.computeHash(requestPath, req.method, req.body);

    try {
      // 2. Check for an already completed cached response
      const cached = await idempotencyService.getCachedResponse(userId, key);
      if (cached) {
        // Enforce payload integrity
        if (cached.paramsHash !== currentHash) {
          return next(
            new AppHttpError(
              422,
              'Idempotency key was previously used with a different request payload or method'
            )
          );
        }

        // Replay cached response
        res.setHeader('Idempotent-Replayed', 'true');
        res.setHeader('Idempotency-Key', key);
        return res.status(cached.statusCode).json(cached.body);
      }

      // 3. Attempt to acquire in-flight distributed lock via Redis SETNX
      const acquired = await idempotencyService.acquireLock(userId, key, 60);
      if (!acquired) {
        // Double check if it just completed between check and lock
        const recheck = await idempotencyService.getCachedResponse(userId, key);
        if (recheck) {
          if (recheck.paramsHash !== currentHash) {
            return next(
              new AppHttpError(
                422,
                'Idempotency key was previously used with a different request payload or method'
              )
            );
          }
          res.setHeader('Idempotent-Replayed', 'true');
          res.setHeader('Idempotency-Key', key);
          return res.status(recheck.statusCode).json(recheck.body);
        }

        // Active in-flight request collision
        return next(
          new ConflictError(
            'A request with this idempotency key is currently in progress. Please retry after completion.'
          )
        );
      }

      // 4. Intercept response to cache result on completion
      let lockReleased = false;
      const releaseLockOnce = async () => {
        if (!lockReleased) {
          lockReleased = true;
          await idempotencyService.releaseLock(userId, key).catch(() => {});
        }
      };

      // Ensure lock is released if client disconnects abruptly
      res.on('close', releaseLockOnce);

      const originalJson = res.json.bind(res);
      res.json = (body: any): Response => {
        const statusCode = res.statusCode;

        // Cache successful responses and non-500 client errors (do not cache 500 server crashes)
        if (statusCode < 500) {
          idempotencyService
            .saveResponse(userId, key, requestPath, currentHash, statusCode, body, ttlSeconds)
            .finally(releaseLockOnce);
        } else {
          releaseLockOnce();
        }

        res.setHeader('Idempotency-Key', key);
        return originalJson(body);
      };

      next();
    } catch (err) {
      await idempotencyService.releaseLock(userId, key).catch(() => {});
      next(err);
    }
  };
}

