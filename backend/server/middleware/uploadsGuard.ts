import { Request, Response, NextFunction } from "express";
import path from "path";
import jwt from "jsonwebtoken";
import ProjectDocument from "../models/ProjectDocument";
import { JWT_SECRET } from "../config/secrets";
import { mayReadUpload } from "../lib/fileAccess";

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

    // A single-file share token opens its one file. A session or files token names a user, and
    // since 2026-10-09 that user must be allowed this file (lib/fileAccess.ts): staff any file, an
    // outside login only what it could see in the app.
    const userOf = (token: string): string | "share" | null => {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
        if (decoded.scope === "file") return decoded.path === normalized ? "share" : null;
        return typeof decoded.userId === "string" ? decoded.userId : null; // files token or a session token
      } catch {
        return null;
      }
    };
    let signedIn = false;
    for (const t of [queryToken, bearer]) {
      if (!t) continue;
      const u = userOf(t);
      if (u === "share") return next();
      if (u) { signedIn = true; if (await mayReadUpload(u, normalized)) return next(); }
    }

    // filePath is stored with OS-native separators — match either form.
    const winPath = "uploads\\" + normalized.replace(/\//g, "\\");
    const posixPath = "uploads/" + normalized;
    const isPublicDoc = await ProjectDocument.exists({
      filePath: { $in: [posixPath, winPath] },
      public: true,
    });
    if (isPublicDoc) return next();

    if (signedIn) return res.status(403).json({ error: "You do not have access to this file." });
    return res.status(401).json({ error: "Authentication required." });
  } catch (err) {
    next(err);
  }
}
