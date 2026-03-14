/**
 * Middleware de validación de entrada
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/index';

/**
 * Validar que el body tenga los campos requeridos
 */
export const validateBody = (requiredFields: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const missingFields = requiredFields.filter((field) => !(field in req.body));

    if (missingFields.length > 0) {
      const error = new AppError(
        400,
        'Missing required fields',
        { missingFields },
      );
      return res.status(error.statusCode).json({
        ok: false,
        error: error.message,
        details: error.details,
      });
    }

    next();
  };
};

/**
 * Validar que los parámetros sean válidos
 */
export const validateParams = (rules: Record<string, (value: any) => boolean>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Record<string, string> = {};

    for (const [param, validate] of Object.entries(rules)) {
      const value = req.body[param];
      if (!validate(value)) {
        errors[param] = `Invalid value for ${param}`;
      }
    }

    if (Object.keys(errors).length > 0) {
      const error = new AppError(400, 'Validation failed', errors);
      return res.status(error.statusCode).json({
        ok: false,
        error: error.message,
        details: error.details,
      });
    }

    next();
  };
};

/**
 * Validar JSON structure
 */
export const validateJson = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.is('json') && !req.is('application/json')) {
      throw new Error('Invalid content type');
    }
    next();
  } catch (err) {
    const error = new AppError(400, 'Invalid JSON in request body');
    return res.status(error.statusCode).json({
      ok: false,
      error: error.message,
    });
  }
};
