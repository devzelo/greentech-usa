import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

/**
 * CR 211: "every table's column headers are clickable to sort". One hook and one <SortTh> so every
 * table in the platform sorts the same way: click a header to sort by it, click again to reverse,
 * click a third time to go back to the table's own order.
 *
 *   const sort = useTableSort(rows, { no: (r) => r.number, date: (r) => r.date });
 *   <SortTh sort={sort} col="no">No.</SortTh>
 *   {sort.rows.map(...)}
 */

export type SortDir = "asc" | "desc";
export type SortGetters<T> = Record<string, (row: T) => unknown>;

export interface TableSort<T> {
  rows: T[];
  /** The same sort applied to another list: for a table split into groups. */
  apply: (list: T[]) => T[];
  key: string;
  dir: SortDir;
  toggle: (key: string) => void;
  has: (key: string) => boolean;
}

/** Numbers sort as numbers, dates as dates, everything else as text (case and accent insensitive). */
const compare = (a: unknown, b: unknown): number => {
  const empty = (v: unknown) => v === null || v === undefined || v === "";
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1;                      // blanks always sit at the bottom
  if (empty(b)) return -1;
  if (typeof a === "boolean" || typeof b === "boolean") return Number(b) - Number(a);
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a), sb = String(b);
  const na = Number(sa.replace(/[^0-9.-]/g, "")), nb = Number(sb.replace(/[^0-9.-]/g, ""));
  const numeric = sa.trim() !== "" && sb.trim() !== "" && !isNaN(na) && !isNaN(nb) && /\d/.test(sa) && /\d/.test(sb) && !/[a-z]{2,}/i.test(sa + sb);
  if (numeric) return na - nb;
  const da = Date.parse(sa), db = Date.parse(sb);
  if (!isNaN(da) && !isNaN(db) && /\d{4}|\d{1,2}[/-]\d{1,2}/.test(sa)) return da - db;
  return sa.localeCompare(sb, undefined, { sensitivity: "base", numeric: true });
};

export function useTableSort<T>(rows: T[], getters: SortGetters<NoInfer<T>>, initial?: { key: string; dir?: SortDir }): TableSort<T> {
  const [key, setKey] = useState(initial?.key || "");
  const [dir, setDir] = useState<SortDir>(initial?.dir || "asc");

  const apply = (list: T[]) => {
    const get = getters[key];
    if (!key || !get) return list;
    return list.slice().sort((a, b) => compare(get(a as never), get(b as never)) * (dir === "asc" ? 1 : -1));
  };
  const sorted = useMemo(() => apply(rows), [rows, key, dir]);   // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: string) => {
    if (k !== key) { setKey(k); setDir("asc"); return; }
    if (dir === "asc") { setDir("desc"); return; }
    setKey("");                                   // third click: back to the table's own order
    setDir("asc");
  };

  return { rows: sorted, apply, key, dir, toggle, has: (k: string) => !!getters[k] };
}

/** A clickable column header. Falls back to a plain header when the column has no getter. */
export function SortTh<T>({ sort, col, children, className = "", align = "left", title }: {
  sort: TableSort<T>;
  col?: string;
  children: ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  title?: string;
}) {
  const base = `px-3 py-2.5 font-bold text-slate-500 uppercase tracking-widest text-[10px] whitespace-nowrap ${align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"} ${className}`;
  if (!col || !sort.has(col)) return <th className={base} title={title}>{children}</th>;
  const on = sort.key === col;
  return (
    <th className={`${base} p-0`} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => sort.toggle(col)}
        title={title || (on ? (sort.dir === "asc" ? "Sorted A to Z. Click to reverse" : "Sorted Z to A. Click for the original order") : "Click to sort by this column")}
        className={`flex w-full items-center gap-1 px-3 py-2.5 ${align === "right" ? "justify-end" : align === "center" ? "justify-center" : ""} uppercase tracking-widest ${on ? "text-primary" : "text-slate-500 hover:text-slate-900"}`}
      >
        {children}
        {on
          ? (sort.dir === "asc" ? <ChevronUp size={11} className="shrink-0" /> : <ChevronDown size={11} className="shrink-0" />)
          : <ChevronsUpDown size={11} className="shrink-0 text-slate-300" />}
      </button>
    </th>
  );
}
