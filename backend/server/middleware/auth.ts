import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/secrets";

export interface AuthedRequest extends Request {
  user?: { userId: string; name: string; email: string; role: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required." });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      name: string;
      email: string;
      role: string;
    };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// Block guest users from an action (defense-in-depth for write routes).
export function blockGuests(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role === "subcontractor") {
    return res.status(403).json({ error: "Guests cannot perform this action." });
  }
  next();
}

// Admin-only guard — for the user-management portal (create/remove employees, reset passwords).
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Administrator access required." });
  }
  next();
}

// Optional auth — attaches user if a valid token is present, otherwise continues.
export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      req.user = jwt.verify(header.slice(7), JWT_SECRET) as AuthedRequest["user"];
    } catch {
      /* ignore */
    }
  }
  next();
}
