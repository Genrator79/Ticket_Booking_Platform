export class AppHttpError extends Error {
  public statusCode: number;
  public details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppHttpError {
  constructor(message = 'Bad Request', details?: unknown) {
    super(400, message, details);
  }
}

export class UnauthorizedError extends AppHttpError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenError extends AppHttpError {
  constructor(message = 'Forbidden') {
    super(403, message);
  }
}

export class NotFoundError extends AppHttpError {
  constructor(message = 'Resource Not Found') {
    super(404, message);
  }
}

export class ConflictError extends AppHttpError {
  constructor(message = 'Conflict: Resource already exists') {
    super(409, message);
  }
}
