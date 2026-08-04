import { Request, Response, NextFunction } from "express";
import multer from "multer";

export function errorHandler(
  err: Error & { statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(err.stack || err);
  const status = err instanceof multer.MulterError ? 400 : err.statusCode || 500;
  // Client errors keep their message; 500s return a generic line so internals don't leak.
  res.status(status).json({ error: status < 500 ? err.message : "Internal server error." });
}
