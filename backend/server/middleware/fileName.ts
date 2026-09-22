import { Request, Response, NextFunction } from "express";

/**
 * CR 265 (2026-09-22): "every file downloaded from the platform should carry the name it has inside
 * the platform". Uploads are stored on disk under a timestamped name, so without this the browser
 * saved something like `1758713204431-doc.pdf`. The screen appends the record's real name to the
 * URL (`?name=...`, plus `dl=1` when it is a download rather than a preview) and this sets the
 * matching Content-Disposition. The name is sanitised: it lands in a header, so quotes, newlines
 * and path separators are stripped.
 */
const clean = (raw: unknown): string =>
  String(raw ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/["\\]/g, "")
    .replace(/[/:*?<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);

export function fileNameHeader(req: Request, res: Response, next: NextFunction) {
  const name = clean(req.query.name);
  if (name) {
    const kind = req.query.dl === "1" ? "attachment" : "inline";
    // The plain filename covers old clients; filename* carries anything non-ASCII (Farsi, accents).
    res.setHeader("Content-Disposition", `${kind}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  }
  next();
}
