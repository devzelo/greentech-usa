import { Request, Response, NextFunction } from "express";
import path from "path";
import jwt from "jsonwebtoken";
import ProjectDocument from "../models/ProjectDocument";
import { JWT_SECRET } from "../config/secrets";

// Folders whose contents render in <img>/<video> tags (no auth header possible)
// and that also power the public marketing site — these stay publicly servable.
const PUBLIC_PATTERNS = [/^avatars\//, /^[^/]+\/project-image\//, /^[^/]+\/gallery\//];

/**
 * Gate for the static /uploads mount. Project documents require either a valid
 * session JWT, a per-user files token (?token=), or a single-file share token.
 * Documents explicitly published to the marketing site stay reachable without auth.
 */
export async function uploadsGuard(req: Request, res: Response, next: NextFunction) {
  try {
    let rel: string;
    try {
      rel = decodeURIComponent(req.path);
    } catch {
      return res.status(400).json({ error: "Bad path." });
    }
    rel = rel.replace(/\\/g, "/").replace(/^\/+/, "");
    const normalized = path.posix.normalize(rel);
    if (!normalized || normalized === "." || normalized.startsWith("..") || path.posix.isAbsolute(normalized)) {
      return res.status(403).json({ error: "Forbidden." });
    }

    if (PUBLIC_PATTERNS.some((p) => p.test(normalized))) return next();

    const header = req.headers.authorization;
    const bearer = header && header.startsWith("Bearer ") ? header.slice(7) : "";
    const queryToken = typeof req.query.token === "string" ? req.query.token : "";

    const grantsAccess = (token: string): boolean => {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
        if (decoded.scope === "files") return true;
        if (decoded.scope === "file") return decoded.path === normalized;
        return typeof decoded.userId === "string"; // a regular session token
      } catch {
        return false;
      }
    };
    if ([queryToken, bearer].some((t) => t && grantsAccess(t))) return next();

    // filePath is stored with OS-native separators — match either form.
    const winPath = "uploads\\" + normalized.replace(/\//g, "\\");
    const posixPath = "uploads/" + normalized;
    const isPublicDoc = await ProjectDocument.exists({
      filePath: { $in: [posixPath, winPath] },
      public: true,
    });
    if (isPublicDoc) return next();

    return res.status(401).json({ error: "Authentication required." });
  } catch (err) {
    next(err);
  }
}
