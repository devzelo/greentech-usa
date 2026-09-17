import { useMemo, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";
import ExportActions, { stamp } from "./ExportActions";

const smallBtn = "rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600";

const MINOR = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "per", "the", "to", "vs", "via", "with"]);

function titleCase(s: string): string {
  return s.toLowerCase().replace(/[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'\u2019]*/g, (w, offset: number, all: string) => {
    const lineStart = offset === 0 || /[\n.:!?]\s*$/.test(all.slice(Math.max(0, offset - 3), offset));
    if (!lineStart && MINOR.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
}

function sentenceCase(s: string): string {
  return s.toLowerCase().replace(/(^\s*|[.!?]\s+|\n\s*)([a-z\u00E0-\u024F])/g, (_m, pre: string, c: string) => pre + c.toUpperCase())
    .replace(/\bi\b/g, "I");
}

const TRANSFORMS: Array<{ label: string; fn: (s: string) => string }> = [
  { label: "UPPERCASE", fn: (s) => s.toUpperCase() },
  { label: "lowercase", fn: (s) => s.toLowerCase() },
  { label: "Title Case", fn: titleCase },
  { label: "Sentence case", fn: sentenceCase },
  { label: "Trim extra spaces", fn: (s) => s.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").trim() },
  { label: "Remove line breaks", fn: (s) => s.replace(/\s*\r?\n\s*/g, " ").trim() },
  { label: "Remove blank lines", fn: (s) => s.split(/\r?\n/).filter((l) => l.trim()).join("\n") },
  {
    label: "Straighten quotes",
    fn: (s) => s.replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"').replace(/[\u2018\u2019\u201A]/g, "'").replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "..."),
  },
  { label: "Remove bullets / numbering", fn: (s) => s.split("\n").map((l) => l.replace(/^\s*(?:[-*\u2022\u25CF\u25E6\u25AA\u2023>]+|\(?\d+[.)]|\(?[a-zA-Z][.)]|[ivxIVX]+[.)])\s+/, "")).join("\n") },
  { label: "Sort lines A to Z", fn: (s) => s.split(/\r?\n/).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true })).join("\n") },
  {
    label: "Remove duplicate lines",
    fn: (s) => {
      const seen = new Set<string>();
      return s.split(/\r?\n/).filter((l) => (seen.has(l) ? false : (seen.add(l), true))).join("\n");
    },
  },
];

function statsOf(text: string) {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const sentences = trimmed ? (trimmed.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []).filter((x) => /\w/.test(x)).length : 0;
  const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).filter((p) => p.trim()).length : 0;
  const mins = words / 200;
  return {
    words,
    chars: text.length,
    noSpaces: text.replace(/\s/g, "").length,
    lines: text ? text.split(/\r?\n/).length : 0,
    sentences,
    paragraphs,
    reading: words === 0 ? "0 min" : mins < 1 ? "< 1 min" : `${Math.round(mins)} min`,
  };
}

export default function TextTools() {
  const [text, setText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const stats = useMemo(() => statsOf(text), [text]);

  const apply = (fn: (s: string) => string) => {
    const next = fn(text);
    if (next === text) return;
    setHistory((h) => [...h.slice(-49), text]);
    setText(next);
  };

  const undo = () => {
    if (!history.length) return;
    setText(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  };

  const clear = () => {
    if (!text) return;
    setHistory((h) => [...h.slice(-49), text]);
    setText("");
  };

  const statItems: Array<[string, string | number]> = [
    ["Words", stats.words],
    ["Characters", stats.chars],
    ["No spaces", stats.noSpaces],
    ["Lines", stats.lines],
    ["Sentences", stats.sentences],
    ["Paragraphs", stats.paragraphs],
    ["Reading", stats.reading],
  ];

  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-bold text-slate-500">Text
        <textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste or type text here"
          className="mt-0.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-primary focus:outline-none"
        />
      </label>

      <dl className="grid grid-cols-4 gap-1 text-center">
        {statItems.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 px-1 py-1">
            <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{k}</dt>
            <dd className="text-xs font-bold tabular-nums text-slate-700">{typeof v === "number" ? v.toLocaleString("en-US") : v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-1">
        {TRANSFORMS.map((t) => (
          <button key={t.label} type="button" className={smallBtn} disabled={!text} onClick={() => apply(t.fn)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
        <div className="flex gap-1">
          <button type="button" className={`${smallBtn} inline-flex items-center gap-1`} disabled={!history.length} onClick={undo}>
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
          <button type="button" className={`${smallBtn} inline-flex items-center gap-1`} disabled={!text} onClick={clear}>
            <Eraser className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
        <ExportActions
          getFile={async () => new File([text], `text-${stamp()}.txt`, { type: "text/plain" })}
          copyText={() => text}
          actions={["save", "copy", "download", "attach", "share"]}
          disabled={!text.trim()}
        />
      </div>
    </div>
  );
}
