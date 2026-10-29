import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import { UnauthorizedError } from '../utils/errors.js';

export class AuthController {
  /**
   * Handles user registration.
   * HTTP 201 Created on success.
   */
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, password } = req.body;
      const result = await authService.register({ name, email, password });

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handles user login with credentials.
   * HTTP 200 OK on success.
   */
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const result = await authService.login({ email, password });

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieves profile information for the authenticated user.
   * HTTP 200 OK on success.
   */
  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User session not authenticated');
      }

      const user = await authService.getCurrentUser(req.user.userId);

      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
