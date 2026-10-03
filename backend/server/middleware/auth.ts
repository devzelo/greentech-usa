import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/secrets";
import User from "../models/User";

export interface AuthedRequest extends Request {
  user?: { userId: string; name: string; email: string; role: string };
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required." });
  }
  const token = header.slice(7);
  let decoded: { userId: string; name: string; email: string; role: string };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as typeof decoded;
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  // A JWT alone is not proof the account is still usable: it stays valid for 7 days, so a
  // deleted or deactivated user kept full access until it expired, and the browser held on to
  // a session for an account that no longer existed (the profile and project pages then failed
  // in confusing ways instead of returning to login). Confirm the account on every request and
  // take role/name/email from the record, so a role change also applies immediately.
  try {
    const account = await User.findById(decoded.userId)
      .select("name email role archived")
      .lean() as { _id: unknown; name?: string; email?: string; role?: string; archived?: boolean } | null;

    if (!account) {
      return res.status(401).json({ error: "This account no longer exists. Please sign in again." });
    }
    if (account.archived) {
      return res.status(401).json({ error: "This account has been deactivated. Please sign in again." });
    }

    req.user = {
      userId: String(account._id),
      name: account.name || "",
      email: account.email || "",
      role: account.role || "",
    };
    return next();
  } catch {
    // The Atlas link on this project drops intermittently. If the check itself cannot run, fall
    // back to the token's own claims rather than locking everyone out during an outage.
    req.user = decoded;
    return next();
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
