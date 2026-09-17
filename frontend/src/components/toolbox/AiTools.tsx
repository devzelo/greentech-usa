import { useState } from "react";
import { Bot, FileText, Languages, Lightbulb, Mail, PenLine, Sparkles } from "lucide-react";

// Quick AI Tools: the layout is ready; the actions switch on with the GT AI Assistant (next phase).
// Text selected on the page when the toolbox opened is brought in automatically.

const ACTIONS = [
  { key: "summarize", label: "Summarize", icon: FileText },
  { key: "rewrite", label: "Rewrite", icon: PenLine },
  { key: "explain", label: "Explain", icon: Lightbulb },
  { key: "translate", label: "Translate", icon: Languages },
  { key: "email", label: "Turn into an email", icon: Mail },
  { key: "assistant", label: "Send to GT AI Assistant", icon: Bot },
];

export default function AiTools({ selection }: { selection: string }) {
  const [text, setText] = useState(selection);
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2">
        <Sparkles size={16} className="mt-0.5 shrink-0 text-violet-500" />
        <p className="text-[11px] font-semibold leading-snug text-violet-700">
          Coming with the GT AI Assistant. These actions will work on the text below once the assistant is connected.
        </p>
      </div>
      <label className="block text-[11px] font-bold text-slate-500">Text
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Select text on the page before opening the toolbox, or paste it here." className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none" />
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        {ACTIONS.map(({ key, label, icon: I }) => (
          <button key={key} type="button" disabled title="Available with the GT AI Assistant" className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-[11px] font-bold text-slate-500 disabled:cursor-not-allowed disabled:opacity-60">
            <I size={13} className="shrink-0 text-violet-400" /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}
