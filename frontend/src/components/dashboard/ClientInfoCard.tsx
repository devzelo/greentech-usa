import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Building2, ExternalLink, Loader2 } from "lucide-react";
import { fetchCompany, withFileToken, companyCategories, type ApiCompany } from "../../lib/api";

/**
 * CR-P (127): the project's client as an information box filled from the Directory company it was
 * picked from, instead of a form to type in. Always read live from the Directory, so an update
 * there shows here. A client typed in before the link existed shows what was saved.
 *
 * CR 277 (2026-09-22): laid out as the client asked, three columns of labelled facts:
 * who they are, where they are, and how to reach them, with their logo.
 */
export default function ClientInfoCard({ info, notes }: {
  info: { name: string; contactName: string; email: string; phone: string; address: string; country: string; reference?: string; companyId?: string };
  /** The project's own note about this client, shown with the rest. */
  notes?: string;
}) {
  const [company, setCompany] = useState<ApiCompany | null>(null);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setCompany(null); setMissing(false);
    if (!info.companyId) return;
    let alive = true;
    setLoading(true);
    fetchCompany(info.companyId)
      .then((c) => { if (alive) setCompany(c); })
      .catch(() => { if (alive) setMissing(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [info.companyId]);

  if (!info.name.trim() && !info.companyId) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 px-5 py-6 text-center">
        <Building2 size={20} className="mx-auto text-slate-300" />
        <p className="mt-2 text-sm font-bold text-slate-500">No client selected yet</p>
        <p className="mt-1 text-xs text-slate-400">Click Edit and pick the client from the Directory.</p>
      </div>
    );
  }

  // Live Directory data when linked; otherwise what was saved on the project.
  const cp = company?.contactPersons?.[0];
  const name = company?.name || info.name;
  const contact = cp?.name || info.contactName;
  const role = cp?.role || "";
  const email = company?.email || cp?.email || info.email;
  const phone = company?.phone || cp?.phone || info.phone;
  const address = company?.address || info.address;
  const website = company?.website || "";
  const clientType = company ? companyCategories(company).join(", ") : "";
  // "Location" is the short form: the last line of the address, or the country held on the project.
  const location = info.country || address.split(",").slice(-2).join(",").trim();

  const field = (label: string, value: ReactNode) => (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 pt-px text-xs font-semibold text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-slate-800">{value || <span className="text-slate-300">-</span>}</span>
    </div>
  );
  const link = (text: string, href: string) => (
    <a href={href} target="_blank" rel="noreferrer" className="break-all text-slate-800 hover:text-primary hover:underline">{text}</a>
  );

  return (
    <div className="space-y-3">
      {(loading || !info.companyId || missing) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
          {loading && <span className="inline-flex items-center gap-1.5 text-slate-400"><Loader2 size={12} className="animate-spin" /> Reading the Directory…</span>}
          {!info.companyId && (
            <span className="inline-flex items-center gap-1.5 text-amber-700"><AlertTriangle size={12} /> Not linked to the Directory. Click Edit and pick this client from the list.</span>
          )}
          {missing && (
            <span className="inline-flex items-center gap-1.5 text-amber-700"><AlertTriangle size={12} /> This client is no longer in the Directory. Showing what was saved.</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-3 lg:divide-x lg:divide-slate-100">
        {/* Who they are */}
        <div className="space-y-3">
          {field("Client / Agency", (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{name}</span>
              {company && (
                <Link to={`/dashboard/directory?open=${company._id}`} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
                  <ExternalLink size={11} /> Open in Directory
                </Link>
              )}
            </span>
          ))}
          {field("Client Type", clientType)}
          {field("Client Contact", contact ? (
            <>
              <span className="font-semibold">{contact}</span>
              {role && <span className="block text-xs text-slate-500">{role}</span>}
            </>
          ) : "")}
          {info.reference ? field("Client Reference", info.reference) : null}
          {notes ? field("Note", <span className="whitespace-pre-line">{notes}</span>) : null}
        </div>

        {/* Where they are */}
        <div className="space-y-3 lg:pl-8">
          {field("Location", location)}
          {field("Address", address ? <span className="whitespace-pre-line">{address}</span> : "")}
          {field("Phone", phone ? link(phone, `tel:${phone.replace(/\s+/g, "")}`) : "")}
        </div>

        {/* How to reach them, and their mark */}
        <div className="space-y-3 lg:pl-8">
          {field("Email", email ? link(email, `mailto:${email}`) : "")}
          {website ? field("Website", link(website, /^https?:/i.test(website) ? website : `https://${website}`)) : null}
          {field("Client Logo", company?.logoUrl ? (
            <img src={withFileToken(company.logoUrl)} alt={`${name} logo`} className="h-14 max-w-[190px] object-contain" />
          ) : (
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-slate-100 bg-white"><Building2 size={18} className="text-slate-300" /></span>
          ))}
        </div>
      </div>
    </div>
  );
}
