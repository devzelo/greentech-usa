/**
 * CR 286 (2026-09-23): a logo on its way into a generated PDF.
 *
 * react-pdf draws an SVG itself and then wants every font in it registered, so a client whose logo
 * is an SVG would stop the whole report from rendering. Painting the picture onto a canvas first
 * hands the document a plain PNG, whatever the Directory holds - SVG, WebP, anything the browser
 * can display - and keeps it small enough not to weigh the file down.
 */
export async function logoAsPng(url: string, maxWidth = 480): Promise<string> {
  const img = await new Promise<HTMLImageElement>((ok, fail) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => ok(el);
    el.onerror = () => fail(new Error("The logo could not be read."));
    el.src = url;
  });
  // An SVG with no intrinsic size reports 0; give it a sensible letterhead-ish box.
  const w0 = img.naturalWidth || 240;
  const h0 = img.naturalHeight || 80;
  const scale = Math.min(1, maxWidth / w0);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w0 * scale));
  c.height = Math.max(1, Math.round(h0 * scale));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("The logo could not be read.");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

/**
 * 2026-10-07 - a photo on its way into a generated PDF (the project report's picture and gallery):
 * painted onto a canvas like a logo, so any picture the browser shows can go in, and kept as a JPEG
 * of a sensible width so a report with a dozen pictures stays light.
 */
export async function photoAsJpeg(url: string, maxWidth = 1000, quality = 0.82): Promise<string> {
  const img = await new Promise<HTMLImageElement>((ok, fail) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => ok(el);
    el.onerror = () => fail(new Error("The picture could not be read."));
    el.src = url;
  });
  const w0 = img.naturalWidth || 800;
  const h0 = img.naturalHeight || 600;
  const scale = Math.min(1, maxWidth / w0);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w0 * scale));
  c.height = Math.max(1, Math.round(h0 * scale));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("The picture could not be read.");
  ctx.fillStyle = "#FFFFFF";   // a transparent PNG gets a white ground, not black
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}
