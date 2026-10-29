import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { UserRole } from '../types/user.js';

/**
 * Middleware that authenticates incoming requests using a JSON Web Token (JWT).
 * Extracts the Bearer token from the HTTP Authorization header and attaches the
 * verified payload to `req.user`.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication token missing or malformed'));
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return next(new UnauthorizedError('Authentication token missing'));
  }

  try {
    const payload = authService.verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Role-based authorization middleware enforcing specific user permissions.
 */
export const requireRole = (role: UserRole) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (req.user.role !== role) {
      return next(new ForbiddenError(`Access denied: Requires ${role} privileges`));
    }

    next();
  };
};
