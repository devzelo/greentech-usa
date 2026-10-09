import { useEffect, useState } from "react";
import { fetchStamps, type CompanyFile } from "../../lib/api";
import ImagePicker, { fileValue, pictureSrc, type PictureChoice } from "./ImagePicker";

/**
 * 2026-10-07 - "the stamp/seal is not working in any document builder. Make it similar to the
 * Signature so we can choose which stamp to use from the Stamp folder, and only one." One picker
 * for every document that carries a company stamp (EOI, cover letter, agreements, POs, requests).
 * 2026-10-09 - a dropdown, as the client drew it: the stamps in Documents › Classified › Stamps by
 * name, a partner's stamps, No stamp, and Upload for a stamp that is not in the folder.
 *
 * A stamp is stored as its file's path ("/uploads/company/…"), which every PDF prints.
 */
export const stampValue = fileValue;
/** The stamp as an <img> source. */
export const stampSrc = pictureSrc;

export default function StampPicker({ value, onChange, disabled, extra = [] }: {
  value?: string;
  onChange: (stamp: string) => void;
  disabled?: boolean;
  /** More stamps to offer, e.g. a JV partner's (name and image path). */
  extra?: PictureChoice[];
}) {
  const [stamps, setStamps] = useState<CompanyFile[] | null>(null);
  useEffect(() => { let alive = true; fetchStamps().then((s) => alive && setStamps(s)).catch(() => alive && setStamps([])); return () => { alive = false; }; }, []);
  const choices: PictureChoice[] = [
    ...(stamps || []).map((f) => ({ name: f.name.replace(/\.[a-z0-9]+$/i, ""), url: stampValue(f), note: "Stamps folder" })),
    ...extra.filter((x) => x.url).map((x) => ({ name: x.name, url: x.url, note: x.note || "Partner" })),
  ].filter((x) => x.url);
  return <ImagePicker kind="stamp" value={value} onChange={onChange} disabled={disabled} choices={choices} loading={stamps === null}
    placeholder="Select stamp" noneLabel="No stamp" noneNote="Signature only" folderHint="Documents › Classified › Stamps" ariaLabel="Company stamp" />;
}
