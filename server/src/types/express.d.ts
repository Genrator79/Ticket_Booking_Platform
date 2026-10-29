import { AuthTokenPayload } from './user';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}
