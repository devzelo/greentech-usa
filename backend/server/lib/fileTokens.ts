import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/secrets";

// Tokens that grant read access to files under /uploads.
//  - scope "files": all files, per logged-in user, short-lived (in-app viewing/downloads)
//  - scope "file":  a single file path, longer-lived (external share links)
export type UploadsTokenPayload =
  | { scope: "files"; userId: string }
  | { scope: "file"; path: string };

export function signFilesToken(userId: string): string {
  return jwt.sign({ scope: "files", userId }, JWT_SECRET, { expiresIn: "24h" });
}

export function signFileShareToken(relPath: string): string {
  return jwt.sign({ scope: "file", path: relPath }, JWT_SECRET, { expiresIn: "7d" });
}
