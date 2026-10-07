import { useState } from "react";
import type { ApiVendor } from "../../lib/api";
import CompanyPicker from "./CompanyPicker";
import DirectoryDetails, { type DirectoryDetailsValue } from "./DirectoryDetails";

/**
 * 2026-10-07 - a project's vendor record (the one RFQs, quotes and POs print) takes its details from
 * its Directory company: they show as the Directory holds them and the record follows them. An
 * older vendor typed in by hand is linked to its Directory company here first.
 */
const cityOf = (address: string) => { const parts = (address || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean); return parts.length > 1 ? parts[parts.length - 2] : ""; };

export default function VendorFromDirectory({ vendor, canEdit, onUpdate }: {
  vendor: ApiVendor;
  canEdit: boolean;
  /** Saves these fields on the vendor record. */
  onUpdate: (patch: Partial<ApiVendor>) => void;
}) {
  // The vendor record keeps a city and country; the address shown is the Directory's own.
  const [address, setAddress] = useState("");
  const fromDirectory = (d: DirectoryDetailsValue): Partial<ApiVendor> => {
    const next = { contactName: d.contactName, email: d.email, phone: d.phone, country: d.country, city: cityOf(d.address) };
    return Object.fromEntries(Object.entries(next).filter(([k, v]) => (vendor[k as keyof ApiVendor] || "") !== v)) as Partial<ApiVendor>;
  };
  if (!vendor.companyId) {
    return (
      <div className="space-y-2">
        <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">"{vendor.name}" was typed in before and is not linked to the Directory. {canEdit ? "Pick its company: its details then come from the Directory." : ""}</p>
        {canEdit && (
          <CompanyPicker size="sm" value="" category="vendor" categories={["vendor", "supplier", "manufacturer", "subcontractor", "logistics", "other"]}
            onNameChange={() => {}} placeholder={`Search the Directory for ${vendor.name}`}
            onSelectCompany={(c) => {
              const cp = c.contactPersons?.[0];
              const parts = (c.address || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
              onUpdate({ name: c.name, companyId: c._id, contactName: cp?.name || "", email: cp?.email || c.email || "", phone: cp?.phone || c.phone || "", country: parts[parts.length - 1] || "", city: parts.length > 1 ? parts[parts.length - 2] : "" });
            }} />
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Company</p>
        <p className="text-sm font-bold text-slate-900">{vendor.name}</p>
      </div>
      <DirectoryDetails companyId={vendor.companyId} name={vendor.name} disabled={!canEdit} fields={["contact", "email", "phone", "address", "country"]}
        value={{ contactName: vendor.contactName, email: vendor.email, phone: vendor.phone, country: vendor.country, address }}
        onChange={(d) => { setAddress(d.address); const patch = fromDirectory(d); if (Object.keys(patch).length) onUpdate(patch); }} />
    </div>
  );
}
