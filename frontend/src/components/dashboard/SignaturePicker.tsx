import { useEffect, useRef, useState, type ReactNode } from "react";
import { Building2, Check, ChevronDown, Loader2, PenLine, Plus, Search, Upload, UserX } from "lucide-react";
import {
  fetchSigners, fetchSignatureFiles, fetchCompanies, uploadPickedImage,
  type ApiSigner, type ApiCompany, type CompanyFile,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import PickerDropdown from "./PickerDropdown";
import { fileValue, pictureKey, pictureSrc } from "./ImagePicker";

/**
 * 2026-10-09 - "the signature dropdown must show all the GT users and GT partner users, with the
 * option to look up inside the Directory. We can have a folder for signatures too, but the signature
 * should mainly come from the user profiles." One picker for who signs a document:
 *   - GreenTech USA: every staff login, each of their profile signatures (with its block);
 *   - Partners: the logins of our partner companies (and JV partners), with theirs;
 *   - the Signatures folder (Documents › Classified › Signatures);
 *   - the Directory: a contact person found by name (their details, no signature picture);
 *   - Upload: a signature picture for this document only.
 */
export type SignerPatch = {
  userId?: string; signatureId?: string;
  name?: string; title?: string; email?: string; phone?: string; website?: string; address?: string;
  /** Always given: "" for a signer with no signature picture. */
  signatureUrl: string;
};

/** A pick as a document's signer fields; a picture-only pick keeps the signer's name and details. */
export function signerFields(p: SignerPatch | null, cur: { signerName?: string; signerTitle?: string; signerEmail?: string; signerPhone?: string }) {
  if (!p) return { signerName: "", signerTitle: "", signerEmail: "", signerPhone: "", signatureUrl: "" };
  if (p.name === undefined) return { signerName: cur.signerName || "", signerTitle: cur.signerTitle || "", signerEmail: cur.signerEmail || "", signerPhone: cur.signerPhone || "", signatureUrl: p.signatureUrl };
  return { signerName: p.name, signerTitle: p.title || "", signerEmail: p.email || "", signerPhone: p.phone || "", signatureUrl: p.signatureUrl };
}

export default function SignaturePicker({ value, onPick, disabled, mode = "select", placeholder = "Choose who signs", ariaLabel = "Signer" }: {
  value?: { name?: string; title?: string; signatureUrl?: string };
  /** The chosen signer (only the picture for a folder or uploaded signature), or null for none. */
  onPick: (p: SignerPatch | null) => void;
  disabled?: boolean;
  /** "add": a button that adds a signer to a list each time. */
  mode?: "select" | "add";
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [signers, setSigners] = useState<ApiSigner[] | null>(null);
  const [folder, setFolder] = useState<CompanyFile[]>([]);
  const [dir, setDir] = useState<ApiCompany[] | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSigners().then((s) => alive && setSigners(s)).catch(() => alive && setSigners([]));
    fetchSignatureFiles().then((f) => alive && setFolder(f)).catch(() => {});
    return () => { alive = false; };
  }, []);
  // The Directory is read the first time someone searches it.
  const needle = q.trim().toLowerCase();
  useEffect(() => { if (open && needle.length >= 2 && dir === null) fetchCompanies().then(setDir).catch(() => setDir([])); }, [open, needle, dir]);

  const close = () => { setOpen(false); setQ(""); };
  const pick = (p: SignerPatch | null) => { onPick(p); close(); };
  const has = (...parts: Array<string | undefined>) => !needle || parts.some((x) => (x || "").toLowerCase().includes(needle));
  const chosen = pictureKey(value?.signatureUrl);

  // Each person once per signature (most have one); a person without one can still be named.
  type Row = { key: string; name: string; sub: string; img: string; on: boolean; patch: SignerPatch };
  const rowsOf = (group: "staff" | "partner"): Row[] => (signers || [])
    .filter((u) => (u.group || "staff") === group)
    .flatMap((u): Row[] => {
      const company = group === "partner" ? u.company || "" : "";
      if (!u.signatures.length) {
        return has(u.name, u.jobTitle, u.email, company) ? [{
          key: `${u.id}-none`, name: u.name, sub: [u.jobTitle, company, "No signature on file"].filter(Boolean).join(" · "), img: "",
          on: !chosen && value?.name === u.name,
          patch: { userId: u.id, name: u.name, title: u.jobTitle || "", email: u.email || "", phone: u.phone || "", signatureUrl: "" },
        }] : [];
      }
      return u.signatures
        .filter((sg) => has(u.name, sg.name, sg.title, sg.label, u.jobTitle, u.email, company))
        .map((sg) => ({
          key: `${u.id}-${sg.id}`, name: sg.name || u.name,
          sub: [sg.title || u.jobTitle, u.signatures.length > 1 ? sg.label : "", company].filter(Boolean).join(" · "),
          img: sg.url, on: !!chosen && pictureKey(sg.url) === chosen,
          patch: {
            userId: u.id, signatureId: sg.id, name: sg.name || u.name, title: sg.title || u.jobTitle || "",
            email: sg.email || u.email || "", phone: sg.phone || u.phone || "", website: sg.website || "", address: sg.address || "", signatureUrl: sg.url,
          },
        }));
    });
  const staff = rowsOf("staff"), partners = rowsOf("partner");
  const files = folder.filter((f) => has(f.name)).map((f): Row => {
    const url = fileValue(f), name = f.name.replace(/\.[a-z0-9]+$/i, "");
    return { key: f._id, name, sub: "Signatures folder", img: url, on: !!chosen && pictureKey(url) === chosen, patch: { signatureUrl: url, ...(value?.name ? {} : { name }) } };
  });
  const contacts: Row[] = needle.length >= 2 ? (dir || []).flatMap((c) => (c.contactPersons || [])
    .filter((p) => p.name && has(p.name, p.role, p.email, c.name))
    .map((p, i) => ({
      key: `${c._id}-${i}`, name: p.name, sub: [p.role, c.name].filter(Boolean).join(" · "), img: "", on: false,
      patch: { name: p.name, title: p.role || "", email: p.email || c.email || "", phone: p.phone || c.phone || "", signatureUrl: "" },
    }))).slice(0, 25) : [];

  const upload = async (file: File) => {
    setBusy(true);
    try { const r = await uploadPickedImage("signature", file); pick({ signatureUrl: r.url, ...(value?.name ? {} : { name: r.name }) }); toast("The signature is added to this document.", "success"); }
    catch (e) { toast(e instanceof Error ? e.message : "Upload failed.", "error"); }
    finally { setBusy(false); }
  };

  const thumb = (src: string) => (
    <span className="flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white p-0.5">
      {src ? <img src={pictureSrc(src)} alt="" className="max-h-full max-w-full object-contain" /> : <PenLine size={14} className="text-slate-300" />}
    </span>
  );
  const rowCls = "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none";
  const section = (title: string, rows: Row[], icon?: ReactNode) => rows.length > 0 && (
    <div className="mb-1">
      <p className="flex items-center gap-1.5 px-2 pb-0.5 pt-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">{icon}{title}</p>
      {rows.map((r) => (
        <button key={r.key} type="button" role="option" aria-selected={r.on} onClick={() => pick(r.patch)} className={rowCls}>
          {thumb(r.img)}
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{r.name}</span>{r.sub && <span className="block truncate text-[10px] text-slate-500">{r.sub}</span>}</span>
          {r.on && mode === "select" && <Check size={14} className="shrink-0 text-primary" />}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      {mode === "add" ? (
        <button ref={btn} type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary disabled:opacity-50">
          <Plus size={12} /> {placeholder}
        </button>
      ) : (
        <button ref={btn} type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
          className={`flex w-full items-center gap-2.5 rounded-xl border bg-white px-2 py-1.5 text-left transition-colors disabled:cursor-default disabled:bg-slate-50 ${open ? "border-primary ring-2 ring-primary/15" : "border-slate-200 hover:border-slate-300"}`}>
          {thumb(value?.signatureUrl || "")}
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-xs font-bold ${value?.name ? "text-slate-800" : "text-slate-400"}`}>{value?.name || placeholder}</span>
            {value?.name && <span className="block truncate text-[10px] text-slate-500">{[value.title, value.signatureUrl ? "" : "No signature picture"].filter(Boolean).join(" · ")}</span>}
          </span>
          {!disabled && <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />}
        </button>
      )}

      <PickerDropdown open={open} onClose={close} anchorRef={btn} label={ariaLabel} minWidth={340}>
        <label className="mb-1 flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
          <Search size={13} className="text-slate-400" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person, or search the Directory" aria-label="Find a signer" className="w-full bg-transparent text-xs outline-none" />
        </label>
        {signers === null && <p className="flex items-center gap-2 px-2 py-2 text-[11px] text-slate-400"><Loader2 size={12} className="animate-spin" /> Loading…</p>}
        {section("GreenTech USA", staff)}
        {section("Partners", partners)}
        {section("Signatures folder", files)}
        {needle.length >= 2 && (dir === null
          ? <p className="flex items-center gap-2 px-2 py-2 text-[11px] text-slate-400"><Loader2 size={12} className="animate-spin" /> Searching the Directory…</p>
          : section("Directory", contacts, <Building2 size={10} />))}
        {signers !== null && !staff.length && !partners.length && !files.length && !contacts.length && (
          <p className="px-2 py-2 text-[11px] text-slate-400">{needle ? (needle.length < 2 ? "Type a little more to search the Directory too." : "No one by that name.") : "No signers yet."}</p>
        )}
        {needle.length < 2 && <p className="px-2 pb-1 text-[10px] text-slate-400">Type a name to search the Directory's contacts as well.</p>}
        <div className="my-1 border-t border-slate-100" />
        <button type="button" role="option" aria-selected={false} disabled={busy} onClick={() => fileRef.current?.click()} className={rowCls}>
          <span className="flex h-9 w-16 shrink-0 items-center justify-center text-slate-500">{busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}</span>
          <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-700">Upload a signature…</span><span className="block text-[10px] text-slate-500">A PNG or JPEG, for this document only</span></span>
        </button>
        {mode === "select" && !!value?.name && (
          <button type="button" role="option" aria-selected={false} onClick={() => pick(null)} className={rowCls}>
            <span className="flex h-9 w-16 shrink-0 items-center justify-center text-slate-400"><UserX size={16} /></span>
            <span className="text-xs font-bold text-slate-600">No signer</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
      </PickerDropdown>
    </div>
  );
}
