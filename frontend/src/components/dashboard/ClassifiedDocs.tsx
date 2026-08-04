import { Lock } from "lucide-react";
import CompanyDocs from "./CompanyDocs";

/**
 * Classified documents — same tabbed main/sub-tab structure as Company Documents,
 * but scoped to kind="classified" (admin-only) with a restricted-access banner.
 */
export default function ClassifiedDocs() {
  return (
    <CompanyDocs
      kind="classified"
      banner={
        <div className="flex items-center gap-2 text-[11px] font-bold text-amber-600 uppercase tracking-widest bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg w-fit">
          <Lock size={12} /> Classified — restricted access
        </div>
      }
    />
  );
}
