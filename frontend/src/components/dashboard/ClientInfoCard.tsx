import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Building2, ExternalLink, Globe, Loader2, Mail, MapPin, Phone, User } from "lucide-react";
import { fetchCompany, withFileToken, type ApiCompany } from "../../lib/api";

/**
 * CR-P (127) — the project's client as a small information box, filled from the Directory company
 * it was picked from (full name, contact, email, phone, address, website), instead of a big form to
 * type in. Always read live from the Directory, so an update there shows here. A client typed in
 * before the link existed shows what was saved, with a hint to pick it from the Directory.
 */
export default function ClientInfoCard({ info }: {
  info: { name: string; contactName: string; email: string; phone: string; address: string; country: string; companyId?: string };
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
        <p className="text-sm font-bold text-slate-500 mt-2">No client selected yet</p>
        <p className="text-xs text-slate-400 mt-1">Click Edit and pick the client from the Directory.</p>
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

  const line = (icon: ReactNode, text: string, href?: string) => text ? (
    <p className="flex items-start gap-2 text-sm text-slate-700 min-w-0">
      <span className="text-slate-400 mt-0.5 shrink-0">{icon}</span>
      {href ? <a href={href} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline break-all">{text}</a> : <span className="break-words">{text}</span>}
    </p>
  ) : null;

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
      <div className="flex items-start gap-4">
        <span className="w-12 h-12 rounded-xl border border-slate-100 bg-white flex items-center justify-center overflow-hidden shrink-0">
          {company?.logoUrl ? <img src={withFileToken(company.logoUrl)} alt="" className="w-full h-full object-contain" /> : <Building2 size={20} className="text-slate-300" />}
        </span>
        <div className="min-w-0 flex-grow">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-bold text-slate-900">{name}</p>
            {loading && <Loader2 size={13} className="animate-spin text-slate-300" />}
            {company && (
              <Link to={`/dashboard/directory?open=${company._id}`} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
                <ExternalLink size={11} /> Open in Directory
              </Link>
            )}
          </div>
          {!info.companyId && (
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 mt-1">
              <AlertTriangle size={11} /> Not linked to the Directory. Click Edit and pick this client from the list to link it.
            </p>
          )}
          {missing && (
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 mt-1">
              <AlertTriangle size={11} /> This client is no longer in the Directory. Showing what was saved.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-3">
            {line(<User size={13} />, [contact, role].filter(Boolean).join(" · "))}
            {line(<Mail size={13} />, email, email ? `mailto:${email}` : undefined)}
            {line(<Phone size={13} />, phone, phone ? `tel:${phone.replace(/\s+/g, "")}` : undefined)}
            {line(<Globe size={13} />, website, website ? (/^https?:/i.test(website) ? website : `https://${website}`) : undefined)}
            {line(<MapPin size={13} />, [address, !company && info.country].filter(Boolean).join(", "))}
          </div>
        </div>
      </div>
    </div>
  );
}
