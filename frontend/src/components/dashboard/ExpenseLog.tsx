import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, ExternalLink, Eye, FolderUp, History, Loader2, MessageSquare, Paperclip, Plus, RotateCcw, Search, Send, Settings2, Trash2, Upload, X, XCircle } from "lucide-react";
import { fetchWorkPackages, fetchExpenseCategories, fetchProcurementPOs,
  addExpense, updateExpense, deleteExpense, uploadExpenseAttachment, deleteExpenseAttachment, addExpenseComment,
  attachmentUrl, fetchBoardMembers, getAuthUser, invoicePaid,
  type ApiExpense, type ApiExpenseCategory, type ExpenseJv, type ExpenseSignature, type ApiExpenseItem, type ApiInvoice, type BoardMember,
} from "../../lib/api";
import type { FiveNumbers } from "../../lib/projectFinance";
import { fmtMoney } from "../../lib/projectFinance";
import { toast } from "../../lib/toast";
import { useDialogs } from "../../lib/useDialogs";
import DocumentViewer from "./DocumentViewer";
import CompanyPicker from "./CompanyPicker";
import PdfPreviewModal from "./PdfPreviewModal";
import { buildExpensePdf } from "../../lib/expensePdf";
import { Fig } from "./FiguresPrivacy";

/**
 * CR-P (153)-(160) — the project's Expense Log.
 *
 * Every expense shows here with who added it. An expense is added in a pop-up (like Add Submittal)
 * with several items (description, quantity, unit, unit price) and a grand total, the date, a remark
 * and the receipts. Each row has Manage: the same pop-up, plus approve / reject (a rejection needs a
 * reason), resend by the author, and a conversation with @mentions. GreenTech staff record past
 * expenses in bulk (already approved) and are the only ones who delete. The log also lists what we
 * still owe on invoices received (payables), read-only, with where they come from. Filter by status
 * and sort by any column.
 */

const num = (s: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")) || 0;
const money = (v: number) => v.toLocaleString(undefined, { style: "currency", currency: "USD" });
const NON_REVENUE = ["Draft", "Cancelled", "Canceled", "Rejected"];
const expTotal = (e: ApiExpense) => (num(e.qty) || 1) * num(e.amount);
const invTotal = (inv: ApiInvoice) => (inv.lineItems?.length ? inv.lineItems.reduce((s, it) => s + num(it.qty) * num(it.unitPrice), 0) : num(inv.amount));

const BADGE: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-600",
  rejected: "bg-red-50 text-red-600",
  pending: "bg-amber-50 text-amber-600",
  payable: "bg-amber-50 text-amber-700",
};

type Status = "all" | "pending" | "approved" | "rejected";
type SortKey = "no" | "description" | "date" | "total" | "status" | "addedBy";
type Entry =
  | { kind: "expense"; id: string; no: number; description: string; date: string; total: number; status: string; addedBy: string; e: ApiExpense }
  | { kind: "payable"; id: string; no: number; description: string; date: string; total: number; status: string; addedBy: string; inv: ApiInvoice };

export default function ExpenseLog({ projectId, rows, setRows, received, onRefreshReceived, onOpenReceived, canEdit, canApprove, canSeeFigures, five, jointVenture }: {
  projectId: string;
  rows: ApiExpense[];
  setRows: (fn: (prev: ApiExpense[]) => ApiExpense[]) => void;
  received: ApiInvoice[];
  onRefreshReceived: () => void;
  onOpenReceived: () => void;
  canEdit: boolean;
  canApprove: boolean;
  canSeeFigures: boolean;
  five: FiveNumbers;
  /** CR 339 - on a joint venture, the partner signs an expense too. */
  jointVenture?: ExpenseJv;
}) {
  const { confirm, dialogs } = useDialogs();
  const me = getAuthUser();
  const isStaff = me?.role !== "subcontractor";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "no", dir: 1 });
  const [editor, setEditor] = useState<{ id: string | null; historic: boolean } | null>(null);
  const [viewFile, setViewFile] = useState<{ name: string; url: string; fileType: string } | null>(null);
  // CR 331 (GT Comments 4) - the chart of accounts, for GreenTech staff only (an outside login never loads it).
  const [cats, setCats] = useState<ApiExpenseCategory[]>([]);
  useEffect(() => { if (isStaff) fetchExpenseCategories(projectId).then(setCats).catch(() => setCats([])); }, [projectId, isStaff]);
  const catName = useMemo(() => new Map(cats.map((c) => [c.code, c.name])), [cats]);

  // The payables come from Invoice Received, which can change on its own tab.
  useEffect(() => { onRefreshReceived(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const replace = (u: ApiExpense) => setRows((p) => (p.some((x) => x._id === u._id) ? p.map((x) => (x._id === u._id ? u : x)) : [...p, u]));

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = rows.map((e, i) => ({
      kind: "expense", id: e._id, no: i + 1, description: e.description || "", date: e.date || "", total: expTotal(e),
      status: e.approval || "pending", addedBy: e.addedByName || "", e,
    }));
    // CR-P (160) — invoices received that are not fully paid: money we owe, shown as pending.
    received.forEach((inv) => {
      if (inv.isTemplate || NON_REVENUE.includes(inv.status || "")) return;
      const left = Math.max(0, invTotal(inv) - invoicePaid(inv));
      if (left <= 0) return;
      list.push({ kind: "payable", id: `inv-${inv._id}`, no: rows.length + list.length + 1, description: `${inv.party || "Invoice"}${inv.description ? `: ${inv.description}` : ""}`, date: inv.date || "", total: left, status: "pending", addedBy: inv.addedByName || "", inv });
    });
    return list;
  }, [rows, received]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = entries.filter((x) => (status === "all" || x.status === status) && (!q || [x.description, x.addedBy, x.kind === "expense" ? x.e.remarks : x.inv.number, ...(x.kind === "expense" ? (x.e.items || []).flatMap((i) => (i.category ? [i.category, catName.get(i.category) || ""] : [])) : [])].some((v) => String(v || "").toLowerCase().includes(q))));
    const val = (x: Entry): string | number => (sort.key === "no" ? x.no : sort.key === "total" ? x.total : String(x[sort.key] || "").toLowerCase());
    return [...filtered].sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; });
  }, [entries, search, status, sort, catName]);

  const counts = useMemo(() => ({
    all: entries.length,
    pending: entries.filter((x) => x.status === "pending").length,
    approved: entries.filter((x) => x.status === "approved").length,
    rejected: entries.filter((x) => x.status === "rejected").length,
  }), [entries]);

  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
  const head = (key: SortKey | null, label: string, cls = "") => (
    <th className={`text-left px-3 py-3 font-bold text-slate-500 uppercase tracking-widest text-[10px] whitespace-nowrap ${cls}`}>
      {key ? (
        <button onClick={() => sortBy(key)} className="inline-flex items-center gap-1 hover:text-slate-900">
          {label}{sort.key === key ? (sort.dir === 1 ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : <ArrowUpDown size={10} className="opacity-40" />}
        </button>
      ) : label}
    </th>
  );

  // Payables and invoice payments are changed where they come from (CR-P 160).
  const explainSource = async (title: string, message: string) => {
    if (await confirm({ title, message, confirmLabel: "Open Invoice Received", cancelLabel: "Close", danger: false })) onOpenReceived();
  };
  const openEntry = (x: Entry) => {
    if (x.kind === "payable") {
      void explainSource(x.inv.poId ? "From Procurement" : "From Invoice Received",
        `This is invoice ${x.inv.number || ""} from ${x.inv.party || "a vendor"}${x.inv.poId ? " (a purchase order in Procurement)" : ""}, not yet fully paid. It counts as a payable here. To change it or record the payment, open it in Invoice Received.`);
      return;
    }
    setEditor({ id: x.e._id, historic: !!x.e.historic });
  };
  const removeRow = async (e: ApiExpense) => {
    if (!(await confirm({ title: "Delete expense?", message: `Delete "${e.description || "this expense"}" and its receipts? Expenses are records: delete only a mistake.`, confirmLabel: "Delete", danger: true }))) return;
    try { await deleteExpense(projectId, e._id); setRows((p) => p.filter((r) => r._id !== e._id)); toast("Expense deleted.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not delete.", "error"); }
  };

  const editing = editor?.id ? rows.find((r) => r._id === editor.id) || null : null;

  return (
    <div className="bg-white p-4 sm:p-6 rounded-3xl sm:rounded-[2.5rem] border border-slate-100 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-xl font-display font-bold text-slate-900">Expense Log</h3>
          <p className="text-xs text-slate-400 mt-1">{rows.length} expense{rows.length === 1 ? "" : "s"}{entries.length > rows.length ? ` · ${entries.length - rows.length} payable${entries.length - rows.length === 1 ? "" : "s"} from invoices received` : ""}. Click Manage to see an expense in full, approve it or reply.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search expenses…" className="bg-slate-50 border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/10 w-44" />
          </div>
          {canEdit && isStaff && (
            <button onClick={() => setEditor({ id: null, historic: true })} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50" title="Record expenses that are already done and paid, in one entry">
              <History size={13} /> Record past expenses
            </button>
          )}
          {canEdit && (
            <button onClick={() => setEditor({ id: null, historic: false })} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-primary">
              <Plus size={13} /> Add Expense
            </button>
          )}
        </div>
      </div>

      {/* CR-P-15 — approved / pending expense totals (only for those who may see the figures). */}
      {canSeeFigures && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="inline-flex items-baseline gap-1.5 px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
            <span className="text-lg font-display font-bold text-emerald-600 leading-none"><Fig>{fmtMoney(five.approvedExpenses)}</Fig></span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Approved Expenses</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 px-4 py-2 rounded-xl bg-amber-50 border border-amber-100">
            <span className="text-lg font-display font-bold text-amber-600 leading-none"><Fig>{fmtMoney(five.pendingExpenses)}</Fig></span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pending Expenses</span>
            <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-white border border-amber-100 text-amber-600">Payables</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 px-4 py-2 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-lg font-display font-bold text-slate-700 leading-none"><Fig>{fmtMoney(five.approvedExpenses + five.pendingExpenses)}</Fig></span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Expenses</span>
          </span>
        </div>
      )}

      {/* CR-P (159) — show one status at a time. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {(["all", "pending", "approved", "rejected"] as Status[]).map((k) => (
          <button key={k} onClick={() => setStatus(k)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold capitalize transition-colors ${status === k ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-500 hover:text-slate-900"}`}>
            {k === "all" ? "All" : k} <span className="opacity-60">({counts[k]})</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead>
            <tr className="bg-slate-50 border-y border-slate-100">
              {head("no", "#")}
              {head("description", "Description")}
              {head("date", "Date")}
              {head("total", "Total")}
              {head(null, "Receipts")}
              {head("addedBy", "Added by")}
              {head("status", "Status")}
              {head(null, "")}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {shown.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400 italic">{entries.length ? "Nothing matches." : "No expenses yet."}</td></tr>}
            {shown.map((x) => {
              const e = x.kind === "expense" ? x.e : null;
              const fromInvoice = !!e?.invoiceId;
              const files = e?.attachments || [];
              return (
                <tr key={x.id} className={`hover:bg-slate-50/40 align-top ${x.kind === "payable" ? "bg-amber-50/20" : ""}`}>
                  <td className="px-3 py-2.5 text-slate-400 font-bold text-[11px] whitespace-nowrap">{x.kind === "expense" ? (e?.expenseNo || x.no) : "-"}</td>
                  <td className="px-3 py-2.5 min-w-[220px]">
                    <button onClick={() => openEntry(x)} className="text-left font-bold text-slate-800 hover:text-primary">{x.description || <span className="text-slate-300 italic">No description</span>}</button>
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      {e && (e.items?.length || 0) > 1 && <span className="text-[10px] text-slate-400">{e.items!.length} items</span>}
                      {e && isStaff && !fromInvoice && catChip(e, catName)}
                      {/* CR 339 - signed by GreenTech, waiting for the joint venture partner. */}
                      {e && jointVenture?.enabled && e.approval === "pending" && (e.signatures || []).some((x) => x.side === "gt") && !(e.signatures || []).some((x) => x.side === "partner") && <span className="px-1.5 py-0.5 rounded bg-violet-50 text-[9px] font-bold text-violet-700 uppercase tracking-wide">Awaiting partner signature</span>}
                      {/* CR 340 - a draft is counted nowhere until submitted; the vendor it was paid to. */}
                      {e?.draft && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-500 uppercase tracking-wide border border-dashed border-slate-300">Draft</span>}
                      {e?.vendorName && <span className="text-[10px] text-slate-500">{e.vendorName}</span>}
                      {e && e.currency && e.currency !== "USD" && e.totalOriginal && <span className="text-[10px] text-slate-400">{e.currency} {Number(e.totalOriginal).toLocaleString()}</span>}
                      {e?.historic && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-500 uppercase tracking-wide">Past expenses</span>}
                      {fromInvoice && <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-[9px] font-bold text-indigo-600 uppercase tracking-wide">From Invoice Received</span>}
                      {x.kind === "payable" && <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-[9px] font-bold text-indigo-600 uppercase tracking-wide">{x.inv.poId ? "From Procurement" : "From Invoice Received"} · {x.inv.number || "invoice"}</span>}
                      {e && (e.comments?.length || 0) > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400"><MessageSquare size={10} /> {e.comments!.length}</span>}
                      {e?.remarks && <span className="text-[10px] text-slate-400 truncate max-w-[220px]" title={e.remarks}>{e.remarks}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{x.date || "—"}</td>
                  <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap">{x.total ? money(x.total) : "—"}</td>
                  <td className="px-3 py-2.5">
                    {files.length ? (
                      <button onClick={() => (files.length === 1 ? setViewFile({ name: files[0].name, url: attachmentUrl(files[0].filePath), fileType: files[0].fileType }) : openEntry(x))} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary/20"><Paperclip size={11} /> {files.length}</button>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">{x.addedBy || "—"}{e && (e.addedByRole === "subcontractor" || e.addedByRole === "guest") ? " (subcontractor)" : ""}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${BADGE[x.kind === "payable" ? "payable" : x.status] || BADGE.pending}`} title={e?.approval === "rejected" && e.rejectReason ? `Reason: ${e.rejectReason}` : undefined}>
                      {x.kind === "payable" ? "Payable" : x.status}
                    </span>
                    {e?.approval === "rejected" && e.rejectReason && <p className="text-[10px] text-red-500 mt-1 max-w-[180px] truncate" title={e.rejectReason}>{e.rejectReason}</p>}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {x.kind === "payable" ? (
                        <button onClick={() => openEntry(x)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold hover:text-primary"><ExternalLink size={11} /> Open</button>
                      ) : (
                        <button onClick={() => openEntry(x)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary"><Settings2 size={12} /> Manage</button>
                      )}
                      {e && isStaff && canEdit && !fromInvoice && <button onClick={() => removeRow(e)} className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50" title="Delete"><Trash2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editor && (
        <ExpenseEditor
          projectId={projectId}
          expense={editing}
          historic={editor.historic}
          canEdit={canEdit}
          canApprove={canApprove && isStaff}
          isStaff={isStaff}
          cats={cats}
          jv={jointVenture?.enabled ? jointVenture : undefined}
          myEmail={me?.email || ""}
          myId={me?.id || ""}
          confirm={confirm}
          onSaved={(u) => { replace(u); setEditor((ed) => (ed ? { ...ed, id: u._id } : ed)); }}
          onOpenReceived={onOpenReceived}
          onClose={() => setEditor(null)}
        />
      )}
      {viewFile && <DocumentViewer doc={viewFile} onClose={() => setViewFile(null)} />}
      {dialogs}
    </div>
  );
}

type Row = ApiExpenseItem & { key: string };
/** CR 331 - an expense's category in the list: its account, "n categories", or a nudge when none is set. */
function catChip(e: ApiExpense, names: Map<string, string>) {
  const codes = [...new Set((e.items || []).map((i) => i.category || ""))];
  const set = codes.filter(Boolean);
  if (!set.length) return <span className="px-1.5 py-0.5 rounded bg-amber-50 text-[9px] font-bold text-amber-700 uppercase tracking-wide">No category</span>;
  const label = set.length === 1 ? `${set[0]} ${names.get(set[0]) || ""}`.trim() : `${set.length} categories`;
  return <span title={set.map((c) => `${c} ${names.get(c) || ""}`).join("\n") + (codes.includes("") ? "\nAn item has no category yet" : "")} className="px-1.5 py-0.5 rounded bg-sky-50 text-[10px] font-bold text-sky-700">{label}{codes.includes("") ? " +?" : ""}</span>;
}
/** The chart as a dropdown: each heading groups the accounts that can be chosen under it. */
function CategorySelect({ cats, value, onChange, disabled, className }: { cats: ApiExpenseCategory[]; value: string; onChange: (v: string) => void; disabled: boolean; className: string }) {
  const groups: Array<{ head: ApiExpenseCategory; items: ApiExpenseCategory[] }> = [];
  for (const c of cats) {
    if (c.heading) groups.push({ head: c, items: [] });
    else if (groups.length) groups[groups.length - 1].items.push(c);
  }
  return (
    <select disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Category" className={`${className} ${value ? "" : "!text-slate-400"}`}>
      <option value="">Select category</option>
      {groups.filter((g) => g.items.length).map((g) => (
        <optgroup key={g.head.code} label={`${g.head.code} ${g.head.name}`}>
          {g.items.map((c) => <option key={c.code} value={c.code} className="text-slate-800">{c.code} {c.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
const newLineId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const blankItem = (): Row => ({ key: Math.random().toString(36).slice(2), id: newLineId(), description: "", qty: "1", unit: "", unitPrice: "", remark: "" });
// CR 340 - the currencies an expense is paid in; anything not USD needs its rate to USD.
const EXP_CURRENCIES = ["USD", "EUR", "GBP", "AED", "SAR", "QAR", "KWD", "TRY", "PKR", "BDT", "INR", "SLE", "NGN", "KES", "ZAR", "CNY", "CAD", "AUD"];
const FOLDER_INPUT = { webkitdirectory: "", directory: "" } as Record<string, string>;

// CR-P (154)-(158) — add / manage one expense: the items, the receipts, the approval and the talk.
function ExpenseEditor({ projectId, expense, historic, canEdit, canApprove, isStaff, cats, jv, myEmail, myId, confirm, onSaved, onOpenReceived, onClose }: {
  projectId: string;
  expense: ApiExpense | null;
  historic: boolean;
  canEdit: boolean;
  canApprove: boolean;
  isStaff: boolean;
  /** CR 331 - the chart of accounts; empty for an outside login, who gets no Category column. */
  cats: ApiExpenseCategory[];
  jv?: ExpenseJv;
  myEmail: string;
  myId: string;
  confirm: ReturnType<typeof useDialogs>["confirm"];
  onSaved: (e: ApiExpense) => void;
  onOpenReceived: () => void;
  onClose: () => void;
}) {
  const fromInvoice = !!expense?.invoiceId;
  const mine = !!expense && String(expense.addedById || "") === myId;
  const editable = canEdit && !fromInvoice && (!expense || isStaff || mine);
  const initItems = (): Row[] => {
    if (expense?.items?.length) return expense.items.map((i) => ({ ...i, id: i.id || newLineId(), remark: i.remark || "", key: Math.random().toString(36).slice(2) }));
    if (expense) return [{ key: "x", id: newLineId(), description: expense.description || "", qty: expense.qty || "1", unit: "", unitPrice: expense.amount || "", remark: "" }];
    if (historic) return [{ key: "h", id: newLineId(), description: "Total of past expenses", qty: "1", unit: "", unitPrice: "", remark: "" }];
    return [blankItem()];
  };
  const [description, setDescription] = useState(expense?.description || (historic ? "Past expenses, January to August" : ""));
  const [date, setDate] = useState(expense?.date || new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState(expense?.remarks || "");
  // CR 340 - the GT form's references, vendor and currency. CR 341 - a vendor's own reference.
  const [receiptNo, setReceiptNo] = useState(expense?.receiptNo || "");
  const [poNo, setPoNo] = useState(expense?.poNo || "");
  const [vendorName, setVendorName] = useState(expense?.vendorName || "");
  const [vendorCompanyId, setVendorCompanyId] = useState(expense?.vendorCompanyId || "");
  const [currency, setCurrency] = useState(expense?.currency || "USD");
  const [exchangeRate, setExchangeRate] = useState(expense?.exchangeRate || "");
  const [reference, setReference] = useState(expense?.reference || "");
  const [poList, setPoList] = useState<string[]>([]);
  useEffect(() => { if (isStaff) fetchProcurementPOs(projectId).then((l) => setPoList(l.map((p) => p.poNo).filter(Boolean))).catch(() => setPoList([])); }, [projectId, isStaff]);
  const [preview, setPreview] = useState(false);
  // CR 328 - the work package it is spent on (only offered when the project has packages this person can see).
  const [workPackageId, setWorkPackageId] = useState(expense?.workPackageId || "");
  const [packages, setPackages] = useState<Array<{ _id: string; name: string; order: number }>>([]);
  useEffect(() => { fetchWorkPackages(projectId).then((r) => setPackages(r.packages.filter((p) => !p.archived || p._id === expense?.workPackageId))).catch(() => setPackages([])); }, [projectId, expense?.workPackageId]);
  const [items, setItems] = useState<Row[]>(initItems);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [viewFile, setViewFile] = useState<{ name: string; url: string; fileType: string } | null>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  // The same expense can be reopened after saving (attachments need a saved expense).
  const lastId = useRef(expense?._id || "");
  useEffect(() => {
    if (expense && expense._id !== lastId.current) {
      lastId.current = expense._id;
    }
  }, [expense]);

  const total = items.reduce((s, i) => s + (num(i.qty) || 0) * num(i.unitPrice), 0);
  const fmtCur = (v: number) => { try { return v.toLocaleString(undefined, { style: "currency", currency: currency || "USD" }); } catch { return `${currency} ${v.toFixed(2)}`; } };
  // CR 331 (GT Comments 4) - "when sub/vendors want to log expense for a project, they can't see the category dropdown. It's only for GT team."
  const showCat = isStaff && cats.length > 0;
  const setItem = (key: string, patch: Partial<Row>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const rateNum = currency === "USD" ? 1 : num(exchangeRate);
  const payload = () => ({
    description: description.trim(),
    date,
    remarks,
    workPackageId,
    receiptNo: receiptNo.trim(), reference: reference.trim(),
    ...(isStaff ? { poNo: poNo.trim(), vendorName: vendorName.trim(), vendorCompanyId, currency, exchangeRate: currency === "USD" ? "" : exchangeRate.trim() } : {}),
    qty: "1",
    amount: (total * (rateNum || 1)).toFixed(2),
    items: items.filter((i) => i.description.trim() || num(i.unitPrice)).map(({ key: _k, category, ...i }) => { void _k; return showCat ? { ...i, category: category || "" } : i; }),
  });
  const typed = (x: ReturnType<typeof payload>) => ({ ...x, items: x.items.map((i) => ({ description: i.description, qty: i.qty, unit: i.unit, unitPrice: i.unitPrice, remark: i.remark || "", ...(showCat ? { category: (i as ApiExpenseItem).category || "" } : {}) })) });
  const dirty = !expense || JSON.stringify(typed(payload())) !== JSON.stringify({
    description: expense.description || "", date: expense.date || "", remarks: expense.remarks || "", workPackageId: expense.workPackageId || "",
    receiptNo: expense.receiptNo || "", reference: expense.reference || "",
    ...(isStaff ? { poNo: expense.poNo || "", vendorName: expense.vendorName || "", vendorCompanyId: expense.vendorCompanyId || "", currency: expense.currency || "USD", exchangeRate: (expense.currency || "USD") === "USD" ? "" : expense.exchangeRate || "" } : {}),
    qty: "1", amount: expTotal(expense).toFixed(2),
    items: (expense.items?.length ? expense.items : [{ description: expense.description || "", qty: expense.qty || "1", unit: "", unitPrice: expense.amount || "" }]).filter((i) => i.description.trim() || num(i.unitPrice)).map((i) => ({ description: i.description, qty: i.qty, unit: i.unit, unitPrice: i.unitPrice, remark: (i as ApiExpenseItem).remark || "", ...(showCat ? { category: (i as ApiExpenseItem).category || "" } : {}) })),
  });

  // CR 340 / 341 - "Save as draft" keeps it out of every total and away from approval; Save / Submit sends it in.
  const isDraft = !!expense?.draft;
  const save = async (close: boolean, asDraft?: boolean) => {
    if (!editable) { onClose(); return; }
    const p = payload();
    if (!p.description && !p.items.length) { toast("Describe the expense or add an item.", "error"); return; }
    if (isStaff && currency !== "USD" && !(num(exchangeRate) > 0)) { toast(`Enter the exchange rate from ${currency} to USD.`, "error"); return; }
    const draft = historic ? undefined : asDraft === undefined ? (expense ? undefined : false) : asDraft;
    setSaving(true);
    try {
      const body = { ...p, ...(draft === undefined ? {} : { draft }) };
      const u = expense ? await updateExpense(projectId, expense._id, body) : await addExpense(projectId, { ...body, historic });
      onSaved(u);
      toast(draft ? "Saved as a draft. It is not counted or sent for approval until you submit it." : draft === false && isDraft ? "Submitted for approval." : expense ? "Expense saved." : historic ? "Past expenses recorded as approved. Attach the receipts below." : "Expense added. Attach the receipt below.", "success");
      if (close) onClose();
    } catch (err) { toast(err instanceof Error ? err.message : "Could not save.", "error"); }
    finally { setSaving(false); }
  };
  const requestClose = async () => {
    if (editable && dirty && (expense || total || description.trim())) {
      if (await confirm({ title: "Save your changes?", message: "This expense has changes that are not saved yet.", confirmLabel: "Save and close", cancelLabel: "Discard", danger: false })) { await save(true); return; }
    }
    onClose();
  };

  const upload = async (files: File[], itemIds: string[] = []) => {
    if (!expense || !files.length) return;
    setUploading({ done: 0, total: files.length });
    let latest: ApiExpense | null = null;
    for (let i = 0; i < files.length; i++) {
      try { latest = await uploadExpenseAttachment(projectId, expense._id, files[i], itemIds); } catch (err) { toast(err instanceof Error ? err.message : "Upload failed.", "error"); }
      setUploading({ done: i + 1, total: files.length });
    }
    setUploading(null);
    if (latest) onSaved(latest);
  };
  const removeFile = async (aid: string, name: string) => {
    if (!expense) return;
    if (!(await confirm({ title: "Delete receipt?", message: `Delete "${name}"? It is removed for good.`, confirmLabel: "Delete", danger: true }))) return;
    try { onSaved(await deleteExpenseAttachment(projectId, expense._id, aid)); } catch (err) { toast(err instanceof Error ? err.message : "Could not delete.", "error"); }
  };

  const setApproval = async (approval: "approved" | "rejected" | "pending", why = "") => {
    if (!expense) return;
    try { onSaved(await updateExpense(projectId, expense._id, { approval, ...(why ? { rejectReason: why } : {}) })); setRejecting(false); setReason(""); toast(approval === "approved" ? "Expense approved." : approval === "rejected" ? "Expense rejected. The person who added it is told why." : "Set back to pending.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not update.", "error"); }
  };
  // CR 339 - approving is signing (GreenTech's side; the partner's too on a joint venture).
  const isPartner = !!jv?.email && myEmail.trim().toLowerCase() === jv.email.trim().toLowerCase();
  const [partnerSig, setPartnerSig] = useState(0);
  const [signing, setSigning] = useState<"" | "gt" | "partner">("");
  const sign = async (side: "gt" | "partner") => {
    if (!expense) return;
    const what = side === "gt" ? "Approve and sign this expense?" : isPartner ? "Sign this expense for the partner?" : `Apply ${jv?.partnerName || "the partner"}'s signature?`;
    const message = side === "gt"
      ? `Your saved signature is put on it${jv ? `. It is approved once ${jv.partnerName || "the partner"} has signed too` : " and it is approved"}.`
      : isPartner ? "Your saved signature is put on it." : "The chosen signature from the joint venture record is put on it, with your name as the person who applied it.";
    if (!(await confirm({ title: what, message, confirmLabel: side === "gt" ? "Approve and sign" : "Sign" }))) return;
    setSigning(side);
    try {
      const u = await updateExpense(projectId, expense._id, { sign: side, ...(side === "partner" ? { signatureIndex: partnerSig } : {}) });
      onSaved(u);
      toast(u.approval === "approved" ? "Signed. The expense is approved." : "Signed. Waiting for the other signature.", "success");
    } catch (err) { toast(err instanceof Error ? err.message : "Could not sign.", "error"); }
    finally { setSigning(""); }
  };
  const resend = async () => {
    if (!expense) return;
    try { onSaved(await updateExpense(projectId, expense._id, { resend: true })); toast("Sent again for approval.", "success"); }
    catch (err) { toast(err instanceof Error ? err.message : "Could not resend.", "error"); }
  };

  const status = expense?.approval || "pending";
  const inp = "w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-70";

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className={`bg-white rounded-3xl shadow-2xl w-full ${showCat ? "max-w-6xl" : "max-w-4xl"} my-10`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{expense ? `Expense · ${expense.description || "No description"}` : historic ? "Record past expenses" : "Add expense"}</p>
            <p className="text-[11px] text-slate-400">
              {expense ? <>Added by {expense.addedByName || "someone"}{expense.historic ? " · past expenses" : ""}</> : historic ? "Expenses already done and paid, in one entry (e.g. January to August). Saved as approved." : "Add every item bought; the total is worked out for you."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {expense && (isDraft ? <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">Draft</span> : <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold capitalize ${BADGE[status]}`}>{status}</span>)}
            <button onClick={requestClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100" title="Close"><X size={18} /></button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {fromInvoice && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2">
              <p className="text-xs text-indigo-700">This expense is a payment recorded on an invoice received. Change it there.</p>
              <button onClick={() => { onClose(); onOpenReceived(); }} className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:underline"><ExternalLink size={11} /> Open Invoice Received</button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="sm:col-span-2 block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description
              <input className={`${inp} mt-1`} disabled={!editable} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Office supplies for the site office" />
            </label>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date
              <input type="date" className={`${inp} mt-1`} disabled={!editable} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>

          {/* CR 340 (GT Comments 4) - the GT form's references, vendor and currency. CR 341 - a vendor's receipt no. and reference. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {isStaff && (
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Expense no.
                <input className={`${inp} mt-1`} disabled value={expense?.expenseNo || "Given on save"} />
              </label>
            )}
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Invoice / receipt no.
              <input className={`${inp} mt-1`} disabled={!editable} value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="e.g. INV-4587" />
            </label>
            {isStaff ? (
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">PO no. <span className="normal-case tracking-normal font-medium">(optional)</span>
                <input className={`${inp} mt-1`} disabled={!editable} value={poNo} onChange={(e) => setPoNo(e.target.value)} placeholder="e.g. PO-8012" list="exp-po-list" />
                <datalist id="exp-po-list">{poList.map((n2) => <option key={n2} value={n2} />)}</datalist>
              </label>
            ) : (
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reference <span className="normal-case tracking-normal font-medium">(optional)</span>
                <input className={`${inp} mt-1`} disabled={!editable} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Your own reference" />
              </label>
            )}
            {isStaff && (
              <>
                <div className="sm:col-span-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vendor
                  <div className="mt-1 normal-case tracking-normal font-normal">
                    {editable
                      ? <CompanyPicker size="sm" value={vendorName} category="vendor" categories={["vendor", "supplier", "subcontractor", "manufacturer", "consultant"]} onNameChange={(v) => { setVendorName(v); setVendorCompanyId(""); }} onSelectCompany={(c) => { setVendorName(c.name); setVendorCompanyId(c._id); }} placeholder="From the Directory" />
                      : <input className={inp} disabled value={vendorName || "-"} />}
                  </div>
                </div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Currency
                  <select className={`${inp} mt-1`} disabled={!editable} value={currency} onChange={(e) => setCurrency(e.target.value)}>{[...new Set([currency, ...EXP_CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}</select>
                </label>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Exchange rate <span className="normal-case tracking-normal font-medium">(1 {currency} = ? USD)</span>
                  <input className={`${inp} mt-1`} disabled={!editable || currency === "USD"} value={currency === "USD" ? "1" : exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} inputMode="decimal" placeholder="e.g. 0.92" />
                </label>
              </>
            )}
          </div>

          {/* The items */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Items{currency !== "USD" ? ` (prices in ${currency})` : ""}</p>
              {/* CR 340 - one file for every line (e.g. one invoice covering them all). */}
              {expense && editable && items.length > 1 && (
                <label className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer"><Paperclip size={11} /> Attach the same file to all lines<input type="file" className="hidden" onChange={(e) => { const f = Array.from(e.target.files || []) as File[]; e.target.value = ""; void upload(f, items.map((i) => i.id || "").filter(Boolean)); }} /></label>
              )}
            </div>
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className={`w-full ${showCat ? "min-w-[1000px]" : "min-w-[760px]"} text-xs`}>
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-500">
                    <th className="text-left px-2 py-2 w-8">#</th>
                    <th className="text-left px-2 py-2 min-w-[12rem]">Description</th>
                    {showCat && <th className="text-left px-2 py-2 w-52">Category (code)</th>}
                    <th className="text-left px-2 py-2 w-16">Qty</th>
                    <th className="text-left px-2 py-2 w-20">Unit</th>
                    <th className="text-left px-2 py-2 w-28">Unit price</th>
                    <th className="text-right px-2 py-2 w-28">Total</th>
                    <th className="text-left px-2 py-2 w-40">Remark</th>
                    <th className="text-left px-2 py-2 w-16">Files</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((it, i) => (
                    <tr key={it.key}>
                      <td className="px-2 py-1.5 text-slate-400 font-bold">{i + 1}</td>
                      <td className="px-1 py-1"><input className={inp} disabled={!editable} value={it.description} onChange={(e) => setItem(it.key, { description: e.target.value })} placeholder="e.g. Monitor" /></td>
                      {showCat && <td className="px-1 py-1"><CategorySelect cats={cats} value={it.category || ""} onChange={(v) => setItem(it.key, { category: v })} disabled={!editable} className={inp} /></td>}
                      <td className="px-1 py-1"><input className={inp} disabled={!editable} value={it.qty} onChange={(e) => setItem(it.key, { qty: e.target.value })} inputMode="decimal" /></td>
                      <td className="px-1 py-1"><input className={inp} disabled={!editable} value={it.unit} onChange={(e) => setItem(it.key, { unit: e.target.value })} placeholder="pcs" /></td>
                      <td className="px-1 py-1"><input className={inp} disabled={!editable} value={it.unitPrice} onChange={(e) => setItem(it.key, { unitPrice: e.target.value })} placeholder="0.00" inputMode="decimal" /></td>
                      <td className="px-2 py-1.5 text-right font-bold text-slate-700 whitespace-nowrap">{fmtCur((num(it.qty) || 0) * num(it.unitPrice))}</td>
                      <td className="px-1 py-1"><input className={inp} disabled={!editable} value={it.remark || ""} onChange={(e) => setItem(it.key, { remark: e.target.value })} placeholder="e.g. Diesel for generator" /></td>
                      <td className="px-1 py-1 whitespace-nowrap">
                        {(() => {
                          const mine2 = (expense?.attachments || []).filter((a) => it.id && (a.itemIds || []).includes(it.id));
                          return (
                            <span className="inline-flex items-center gap-1">
                              {mine2.length > 0 && <button onClick={() => setViewFile({ name: mine2[0].name, url: attachmentUrl(mine2[0].filePath), fileType: mine2[0].fileType })} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold" title={mine2.map((a) => a.name).join(", ")}><Paperclip size={10} /> {mine2.length}</button>}
                              {expense && editable && it.id && <label className="p-1 rounded text-slate-300 hover:text-primary cursor-pointer" title="Attach a file to this line"><Upload size={12} /><input type="file" multiple className="hidden" onChange={(e) => { const f = Array.from(e.target.files || []) as File[]; e.target.value = ""; void upload(f, [it.id!]); }} /></label>}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-1 py-1">{editable && items.length > 1 && <button onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} className="p-1 rounded text-slate-300 hover:text-red-500" title="Remove item"><X size={13} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50">
                    <td colSpan={showCat ? 6 : 5} className="px-2 py-2">
                      {editable && <button onClick={() => setItems((l) => [...l, blankItem()])} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"><Plus size={12} /> Add item</button>}
                    </td>
                    <td className="px-2 py-2 text-right text-sm font-display font-bold text-slate-900 whitespace-nowrap">{fmtCur(total)}{currency !== "USD" && rateNum > 0 && <span className="block text-[10px] font-medium text-slate-500">{money(total * rateNum)}</span>}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Grand total of all items{currency !== "USD" ? `, and in USD at the rate entered (totals across the platform are in USD)` : ""}.{expense ? "" : " Files can be attached to each line once the expense is saved."}</p>
          </div>

          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Remark
            <input className={`${inp} mt-1`} disabled={!editable} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Anything finance should know" />
          </label>
          {packages.length > 0 && (
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Work package
              <select className={`${inp} mt-1`} disabled={!editable} value={workPackageId} onChange={(e) => setWorkPackageId(e.target.value)}>
                <option value="">None</option>
                {packages.map((p, i) => <option key={p._id} value={p._id}>{i + 1}.0 {p.name}</option>)}
              </select>
              <span className="block mt-1 text-[9px] font-medium normal-case text-slate-400">Once approved, it counts in that package's Paid.</span>
            </label>
          )}

          {/* Receipts */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Paperclip size={12} /> Receipts {expense?.attachments?.length ? `(${expense.attachments.length})` : ""}</p>
              {expense && editable && (
                uploading ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><Loader2 size={12} className="animate-spin" /> Uploading {uploading.done} of {uploading.total}…</span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-primary cursor-pointer"><Upload size={12} /> Upload<input type="file" multiple className="hidden" onChange={(e) => { const f = Array.from(e.target.files || []) as File[]; e.target.value = ""; void upload(f); }} /></label>
                    <button onClick={() => folderRef.current?.click()} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-50" title="Upload a folder of receipts"><FolderUp size={12} /> Folder</button>
                    <input ref={folderRef} type="file" multiple className="hidden" {...FOLDER_INPUT} onChange={(e) => { const f = (Array.from(e.target.files || []) as File[]).filter((x) => !/^\./.test(x.name)); e.target.value = ""; void upload(f); }} />
                  </div>
                )
              )}
            </div>
            {!expense ? (
              <p className="text-[11px] text-slate-400 italic">Save the expense first, then attach the receipt{historic ? "s (a whole folder works)" : ""}.</p>
            ) : (expense.attachments || []).length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">No receipt attached.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {expense.attachments.map((a) => (
                  <span key={a._id} className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg bg-slate-50 border border-slate-100 text-[11px] font-bold text-slate-600">
                    <button onClick={() => setViewFile({ name: a.name, url: attachmentUrl(a.filePath), fileType: a.fileType })} className="inline-flex items-center gap-1 hover:text-primary max-w-[14rem] truncate" title={a.name}><Eye size={11} /> {a.name}</button>
                    {editable && <button onClick={() => removeFile(a._id, a.name)} className="p-0.5 rounded text-slate-300 hover:text-red-500"><X size={11} /></button>}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* CR-P (156) — approval, inside Manage. */}
          {expense && !fromInvoice && isDraft && (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-[11px] text-slate-500">A draft: not counted in any total and not sent for approval. Submit it when it is complete.</p>
          )}
          {expense && !fromInvoice && !isDraft && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Approval</p>
              {/* CR 339 - "if approved, manager signature is needed. If it's JV, 2 signatures are needed, one from each partner." */}
              {!expense.historic && status !== "rejected" && (
                <div className={`grid gap-3 ${jv ? "sm:grid-cols-2" : ""}`}>
                  {(jv ? (["gt", "partner"] as const) : (["gt"] as const)).map((side) => {
                    const s = (expense.signatures || []).find((x) => x.side === side);
                    return (
                      <div key={side} className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{side === "gt" ? "GreenTech manager" : jv?.partnerName || "Joint venture partner"}</p>
                        {s ? <SignatureMark s={s} /> : side === "gt" ? (
                          canApprove
                            ? <button onClick={() => void sign("gt")} disabled={!!signing} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">{signing === "gt" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve and sign</button>
                            : <p className="mt-2 text-[11px] text-slate-400">Waiting for the project manager's signature.</p>
                        ) : isPartner ? (
                          <button onClick={() => void sign("partner")} disabled={!!signing} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">{signing === "partner" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Sign as partner</button>
                        ) : canApprove && (jv?.signatures || []).length ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <select value={partnerSig} onChange={(e) => setPartnerSig(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">{(jv?.signatures || []).map((x, i) => <option key={i} value={i}>{x.name || `Signature ${i + 1}`}</option>)}</select>
                            <button onClick={() => void sign("partner")} disabled={!!signing} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 text-xs font-bold hover:bg-emerald-50 disabled:opacity-50">{signing === "partner" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Apply partner's signature</button>
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] text-slate-400">{canApprove ? "The partner signs from its own login, or add its signature to the joint venture record (Project Info) to apply it here." : "Waiting for the partner's signature."}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {status === "rejected" && expense.rejectReason && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2">
                  <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-700"><b>Rejected:</b> {expense.rejectReason}</p>
                </div>
              )}
              {canApprove ? (
                rejecting ? (
                  <div className="space-y-2">
                    <textarea autoFocus rows={2} className={`${inp} resize-y`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it rejected? e.g. The receipt is not attached. Please add it and send it again." />
                    <div className="flex items-center gap-2">
                      <button onClick={() => { if (!reason.trim()) { toast("Say why the expense is rejected.", "error"); return; } void setApproval("rejected", reason.trim()); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700"><XCircle size={13} /> Reject with this reason</button>
                      <button onClick={() => { setRejecting(false); setReason(""); }} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {status !== "rejected" && <button onClick={() => setRejecting(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50"><XCircle size={13} /> Reject</button>}
                    {status !== "pending" && <button onClick={() => setApproval("pending")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white"><RotateCcw size={12} /> Back to pending</button>}
                  </div>
                )
              ) : status === "rejected" && mine ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] text-slate-500">Fix what is asked (e.g. attach the receipt), then send it again.</p>
                  <button onClick={resend} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90"><Send size={12} /> Resend for approval</button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">{status === "approved" ? "Approved and signed." : status === "pending" ? (jv ? "Waiting for both signatures." : "Waiting for the project manager to approve and sign it.") : "Rejected."}</p>
              )}
            </div>
          )}

          {/* CR-P (157) — the conversation on this expense. */}
          {expense && <ExpenseComments projectId={projectId} expense={expense} onSaved={onSaved} canComment={canEdit || mine} />}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-3xl">
          <p className={`text-[11px] font-bold ${editable && dirty ? "text-amber-600" : "text-slate-400"}`}>{!editable ? "View only" : dirty ? "Unsaved changes" : "All changes saved"}</p>
          <div className="flex items-center gap-2">
            {expense && <button onClick={() => setPreview(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50"><Eye size={12} /> Preview</button>}
            {editable ? (
              <>
                {!historic && (!expense || isDraft) && <button onClick={() => save(false, true)} disabled={saving} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-40">Save as draft</button>}
                {expense && !isDraft && <button onClick={() => save(false)} disabled={saving || !dirty} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-40">Save</button>}
                <button onClick={() => save(true, isDraft || !expense ? false : undefined)} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50">{saving && <Loader2 size={12} className="animate-spin" />} {historic ? "Save and close" : !expense || isDraft ? (isStaff ? "Save and submit" : "Submit for approval") : "Save and close"}</button>
              </>
            ) : (
              <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold">Close</button>
            )}
          </div>
        </div>
      </div>
      {viewFile && <DocumentViewer doc={viewFile} onClose={() => setViewFile(null)} />}
      {preview && expense && (
        <PdfPreviewModal title={`Expense ${expense.expenseNo || ""}`.trim()} fileName={`${expense.expenseNo || "Expense"}.pdf`} build={() => buildExpensePdf(expense, { categoryName: showCat ? (code: string) => cats.find((c) => c.code === code)?.name || "" : undefined, workPackage: packages.find((p) => p._id === expense.workPackageId)?.name })} onClose={() => setPreview(false)} />
      )}
    </div>
  );
}

/** CR 339 - a signature on an expense: the image, who, their title, when (and who applied it). */
function SignatureMark({ s }: { s: ExpenseSignature }) {
  const src = (() => { const v = (s.signatureUrl || "").replace(/^\/+/, ""); return v.startsWith("uploads/") ? attachmentUrl(v) : s.signatureUrl; })();
  return (
    <div className="mt-1">
      {src && <img src={src} alt={`Signature of ${s.name}`} className="h-12 max-w-[12rem] object-contain" />}
      <p className="text-xs font-bold text-slate-800">{s.name}</p>
      <p className="text-[10px] text-slate-500">{[s.title, new Date(s.at).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })].filter(Boolean).join(" · ")}</p>
      {s.appliedByName && <p className="text-[10px] text-slate-400">Applied by {s.appliedByName}</p>}
    </div>
  );
}

function ExpenseComments({ projectId, expense, onSaved, canComment }: { projectId: string; expense: ApiExpense; onSaved: (e: ApiExpense) => void; canComment: boolean }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [picked, setPicked] = useState<BoardMember[]>([]);
  const [menu, setMenu] = useState<string | null>(null);   // the @query being typed
  const ref = useRef<HTMLTextAreaElement>(null);
  const myId = getAuthUser()?.id || "";
  useEffect(() => { fetchBoardMembers(projectId).then((m) => setMembers(m.filter((x) => x.userId && x.userId !== myId))).catch(() => setMembers([])); }, [projectId, myId]);
  const matches = menu === null ? [] : members.filter((m) => !menu || m.name.toLowerCase().includes(menu.toLowerCase())).slice(0, 8);

  const onInput = (v: string) => { setText(v); const m = /@([^\s@]*)$/.exec(v); setMenu(m && members.length ? m[1] : null); };
  const pick = (m: BoardMember) => {
    setPicked((p) => (p.some((x) => x.userId === m.userId) ? p : [...p, m]));
    setText((t) => t.replace(/@([^\s@]*)$/, `@${m.name} `));
    setMenu(null);
    setTimeout(() => ref.current?.focus(), 0);
  };
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      onSaved(await addExpenseComment(projectId, expense._id, { text: body, mentions: picked.filter((m) => body.includes(`@${m.name}`)).map((m) => m.userId) }));
      setText(""); setPicked([]);
    } catch (err) { toast(err instanceof Error ? err.message : "Could not post.", "error"); }
    finally { setSending(false); }
  };

  const comments = expense.comments || [];
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2"><MessageSquare size={12} /> Conversation {comments.length ? `(${comments.length})` : ""}</p>
      <div className="space-y-2 mb-2">
        {comments.length === 0 ? <p className="text-[11px] text-slate-400 italic">No messages yet. Ask a question or answer one here.</p> : comments.map((c, i) => (
          <div key={i} className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[11px]"><span className="font-bold text-slate-700">{c.authorName || "Someone"}</span> <span className="text-slate-400">{c.at ? new Date(c.at).toLocaleString() : ""}</span></p>
            <p className="text-xs text-slate-700 whitespace-pre-wrap break-words">{c.text}</p>
          </div>
        ))}
      </div>
      {canComment && (
        <div>
          <textarea ref={ref} rows={2} value={text} onChange={(e) => onInput(e.target.value)} placeholder="Write a message… type @ to tag someone" className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs outline-none focus:bg-white focus:ring-2 focus:ring-primary/10 resize-y" />
          {matches.length > 0 && (
            <div className="mt-1 rounded-xl border border-slate-100 shadow-lg bg-white p-1 max-h-44 overflow-y-auto">
              {matches.map((m) => <button key={m.key} onClick={() => pick(m)} className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50">@{m.name}</button>)}
            </div>
          )}
          <div className="flex justify-end mt-1.5">
            <button onClick={send} disabled={sending || !text.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold disabled:opacity-40">{sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Post</button>
          </div>
        </div>
      )}
    </div>
  );
}
