/**
 * Middleware centralizado de manejo de errores
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, ApiResponse } from '../types/index';
import logger from '../config/logger';

/**
 * Error handler middleware (debe ser el último middleware)
 */
export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  // Log el error
  logger.error('Request error', {
    name: err.name,
    message: err.message,
    stack: (err as Error).stack,
  });

  // Si es un AppError, usar su statusCode
  if (err instanceof AppError) {
    const response: ApiResponse = {
      ok: false,
      error: err.message,
      details: err.details,
      timestamp: new Date().toISOString(),
    };
    return res.status(err.statusCode).json(response);
  }

  // Error genérico (500)
  const response: ApiResponse = {
    ok: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
  };

  // En desarrollo, mostrar detalles
  if (process.env.NODE_ENV === 'development') {
    response.details = err.message;
  }

  res.status(500).json(response);
};

/**
 * 404 Handler (no encontrado)
 */
export const notFoundHandler = (_req: Request, res: Response) => {
  const response: ApiResponse = {
    ok: false,
    error: 'Endpoint not found',
    timestamp: new Date().toISOString(),
  };
  res.status(404).json(response);
};
