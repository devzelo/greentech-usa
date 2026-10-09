import { useEffect, useState } from "react";
import { formatPhone } from "../../lib/phone";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { fetchCompanies, fetchCompany, type ApiCompany, type CompanyCategory } from "../../lib/api";

/**
 * 2026-10-07 - "whenever you see third party information, make sure it comes from the Directory":
 * an outside company's contact details, read from its Directory record. The contact is chosen
 * among the company's people (their phone and email, else the company's); the rest shows as it is
 * in the Directory, with a link to change it there. The form keeps a copy (the snapshot printed on
 * its documents), refreshed from the record whenever the company is opened here.
 */
export type DirectoryField = "contact" | "email" | "phone" | "address" | "country" | "website";
export interface DirectoryDetailsValue { contactName: string; email: string; phone: string; address: string; country: string; website: string }

/** The country: the last part of the company's address ("Accra, Ghana" -> "Ghana"). */
export const countryOf = (address: string) => (address || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean).pop() || "";

/** A company's details, for the chosen contact (the first one when that name is not among its people). */
export function detailsOf(c: ApiCompany, contactName = ""): DirectoryDetailsValue {
  const people = c.contactPersons || [];
  const cp = people.find((p) => p.name && p.name === contactName) || people[0];
  return {
    contactName: cp?.name || "", email: cp?.email || c.email || "", phone: cp?.phone || c.phone || "",
    address: c.address || "", country: countryOf(c.address), website: c.website || "",
  };
}

const LABEL: Record<DirectoryField, string> = { contact: "Contact person", email: "Email", phone: "Phone", address: "Address", country: "Country", website: "Website" };

export default function DirectoryDetails({ companyId, name, value, onChange, fields = ["contact", "email", "phone", "address"], className = "", disabled = false }: {
  /** The Directory company ("" when the name was typed and not picked). */
  companyId: string;
  /** The company's name as the form holds it (for the "not in the Directory" note). */
  name: string;
  value: Partial<DirectoryDetailsValue>;
  /** New details from the record: read again when opened (`byUser` false), or another contact chosen (true). */
  onChange: (v: DirectoryDetailsValue, byUser: boolean) => void;
  fields?: DirectoryField[];
  className?: string;
  /** Read only: the contact shows as text, not a choice. */
  disabled?: boolean;
}) {
  const [company, setCompany] = useState<ApiCompany | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!companyId) { setCompany(null); return; }
    let alive = true;
    setLoading(true);
    fetchCompany(companyId)
      .then((c) => {
        if (!alive) return;
        setCompany(c);
        const next = detailsOf(c, value.contactName || "");
        if (fields.some((f) => (f === "contact" ? next.contactName : next[f]) !== ((f === "contact" ? value.contactName : value[f]) || ""))) onChange(next, false);
      })
      .catch(() => { if (alive) setCompany(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Read again when another company is picked; the form's own copy is what changes below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  if (!companyId) {
    if (disabled) return null;
    return name.trim()
      ? <p className={`flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 ${className}`}><AlertTriangle size={12} className="mt-0.5 shrink-0" /> "{name.trim()}" is not picked from the Directory. Choose it from the list, or add it there, so its details come from its record.</p>
      : <p className={`text-[11px] text-slate-400 ${className}`}>Pick the company from the Directory: its contact details are read from there.</p>;
  }
  const people = company?.contactPersons || [];
  const shown = (f: DirectoryField) => (f === "contact" ? value.contactName : f === "phone" ? formatPhone(value.phone) : value[f]) || "";
  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f} className={`min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 ${f === "address" ? "sm:col-span-2" : ""}`}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{LABEL[f]}</p>
            {f === "contact" && people.length > 1 && !disabled ? (
              <select value={value.contactName || ""} onChange={(e) => company && onChange(detailsOf(company, e.target.value), true)} aria-label="Contact person"
                className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold text-slate-800">
                {people.map((p) => <option key={p.name} value={p.name}>{p.name}{p.role ? ` (${p.role})` : ""}</option>)}
              </select>
            ) : (
              <p className={`mt-0.5 text-xs font-semibold text-slate-800 ${f === "address" ? "whitespace-pre-line" : "truncate"}`} title={shown(f)}>{shown(f) || <span className="font-normal text-slate-400">Not in the Directory record</span>}</p>
            )}
          </div>
        ))}
      </div>
      {!disabled && <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500">
        {loading && <Loader2 size={11} className="animate-spin" />}
        Read from the company's Directory record. To change these details,{" "}
        <button type="button" onClick={() => window.open(`/dashboard/directory?open=${encodeURIComponent(companyId)}`, "_blank", "noopener")} className="inline-flex items-center gap-0.5 font-bold text-primary hover:underline">edit it in the Directory <ExternalLink size={10} /></button>.
      </p>}
    </div>
  );
}

/**
 * 2026-10-07 - a company from the Directory: by its id, else by its exact name (older records keep
 * only the name). null while loading or when it is not in the Directory.
 */
export function useDirectoryCompany(companyId?: string, name?: string, category?: CompanyCategory): ApiCompany | null {
  const [company, setCompany] = useState<ApiCompany | null>(null);
  const key = companyId ? `id:${companyId}` : name?.trim() ? `name:${category || ""}:${name.trim().toLowerCase()}` : "";
  useEffect(() => {
    if (!key) { setCompany(null); return; }
    let alive = true;
    const find = companyId
      ? fetchCompany(companyId)
      : fetchCompanies(category).then((list) => list.find((c) => c.name.trim().toLowerCase() === (name || "").trim().toLowerCase()) || null);
    find.then((c) => { if (alive) setCompany(c); }).catch(() => { if (alive) setCompany(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return company;
}

export type DirectoryPerson = ApiCompany["contactPersons"][number];

/** One of a company's people in the Directory (a name typed before stays, marked). */
export function DirectoryPersonSelect({ company, value, onPick, disabled, placeholder = "Choose a person (the company's people in the Directory)", className = "" }: {
  company: ApiCompany | null;
  value: string;
  onPick: (p: DirectoryPerson | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const people = company?.contactPersons || [];
  if (!people.length) {
    return <p className={`text-[11px] text-slate-400 ${className}`}>{company ? `${company.name}'s Directory record has no people yet: add them in the Directory.` : "Pick the company from the Directory first."}{value ? ` Now: ${value}.` : ""}</p>;
  }
  const legacy = !!value && !people.some((p) => p.name === value);
  return (
    <select value={value} disabled={disabled} onChange={(e) => onPick(people.find((p) => p.name === e.target.value) || null)} aria-label="Person"
      className={`w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60 ${className}`}>
      <option value="">{placeholder}</option>
      {legacy && <option value={value}>{value} (typed before; not in the Directory)</option>}
      {people.map((p) => <option key={p.name} value={p.name}>{p.name}{p.role ? ` (${p.role})` : ""}</option>)}
    </select>
  );
}
