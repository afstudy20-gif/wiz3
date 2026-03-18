/**
 * PlotExporter – floating ↓ button that downloads any Plotly chart as PNG/SVG.
 * Plotly is imported lazily inside the handler so this file adds no extra
 * top-level dependency on plotly.js (the chart component already loads it).
 */
import { useState } from "react";

interface Props {
  plotRef: React.RefObject<any>;
  title?: string;
  className?: string;
}

export default function PlotExporter({ plotRef, title = "chart", className = "" }: Props) {
  const [open, setOpen]     = useState(false);
  const [width, setWidth]   = useState(1200);
  const [height, setHeight] = useState(700);
  const [fmt, setFmt]       = useState<"png" | "svg">("png");
  const [busy, setBusy]     = useState(false);

  const safeTitle = title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 40) || "chart";
  const getEl = (): HTMLElement | null => plotRef.current?.el ?? plotRef.current;

  const downloadImage = async () => {
    const el = getEl();
    if (!el) return;
    setBusy(true);
    try {
      // Lazy import: plotly is already in the bundle (loaded by chart components),
      // so this resolves instantly from the module cache with no extra network cost.
      const Plotly = (await import("plotly.js")).default;
      await Plotly.downloadImage(el, { format: fmt, width, height, filename: safeTitle });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div className={`absolute top-2 right-2 z-10 ${className}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded-lg bg-white/80 border border-gray-200 shadow-sm text-gray-500 hover:text-indigo-600 hover:bg-white hover:border-indigo-200 transition-colors text-xs"
        title="Export chart"
      >
        ↓
      </button>

      {open && (
        <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-52 space-y-3 z-20">
          <p className="text-xs font-semibold text-gray-700">Export Chart</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Width px</label>
              <input type="number" value={width} onChange={e => setWidth(+e.target.value)}
                className="select w-full text-xs py-0.5" min={400} max={4000} step={100} />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Height px</label>
              <input type="number" value={height} onChange={e => setHeight(+e.target.value)}
                className="select w-full text-xs py-0.5" min={200} max={3000} step={100} />
            </div>
          </div>

          <div className="flex rounded overflow-hidden border border-gray-200">
            {(["png", "svg"] as const).map(f => (
              <button key={f} onClick={() => setFmt(f)}
                className={`flex-1 text-xs py-1 transition-colors ${fmt === f ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          <button onClick={downloadImage} disabled={busy} className="btn-primary w-full text-xs py-1.5">
            {busy ? "Exporting…" : `Download ${fmt.toUpperCase()}`}
          </button>

          <button onClick={() => setOpen(false)} className="w-full text-[10px] text-gray-400 hover:text-gray-700 py-0.5">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
