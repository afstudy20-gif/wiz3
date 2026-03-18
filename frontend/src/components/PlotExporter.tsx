/**
 * PlotExporter – floating toolbar that attaches to any <Plot> chart.
 * Usage:
 *   <div className="relative">
 *     <Plot ref={plotRef} ... />
 *     <PlotExporter plotRef={plotRef} title="My Chart" />
 *   </div>
 *
 * For PPTX export pptxgenjs is used client-side.
 */
import { useState } from "react";
import Plotly from "plotly.js";
// @ts-ignore – pptxgenjs ships CJS; types may not resolve in some setups
import pptxgen from "pptxgenjs";

interface Props {
  /** React ref pointing to the react-plotly.js Plot element */
  plotRef: React.RefObject<any>;
  /** Chart title used in the downloaded filenames and PPTX slide */
  title?: string;
  /** Extra className applied to the toolbar wrapper */
  className?: string;
}

export default function PlotExporter({ plotRef, title = "chart", className = "" }: Props) {
  const [open, setOpen]     = useState(false);
  const [width, setWidth]   = useState(1200);
  const [height, setHeight] = useState(700);
  const [fmt, setFmt]       = useState<"png" | "svg">("png");
  const [busy, setBusy]     = useState(false);

  const safeTitle = title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").slice(0, 40) || "chart";

  const getEl = (): HTMLElement | null =>
    plotRef.current?.el ?? plotRef.current;

  const downloadImage = async () => {
    const el = getEl();
    if (!el) return;
    setBusy(true);
    try {
      await Plotly.downloadImage(el, {
        format: fmt,
        width,
        height,
        filename: safeTitle,
      });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const exportPptx = async () => {
    const el = getEl();
    if (!el) return;
    setBusy(true);
    try {
      // Capture as PNG data URL
      const imgData = await Plotly.toImage(el, { format: "png", width, height });
      const prs = new pptxgen();
      prs.layout = "LAYOUT_WIDE"; // 13.33" × 7.5"
      const slide = prs.addSlide();
      // Title text box
      slide.addText(title, {
        x: 0.4, y: 0.2, w: 12.5, h: 0.5,
        fontSize: 20, bold: true, color: "111827",
      });
      // Chart image fills most of the slide
      slide.addImage({
        data: imgData,
        x: 0.4, y: 0.85, w: 12.5, h: 6.4,
      });
      // Footer
      slide.addText(`YuStat · ${new Date().toLocaleDateString()}`, {
        x: 0.4, y: 7.1, w: 12.5, h: 0.3,
        fontSize: 9, color: "9ca3af", align: "right",
      });
      await prs.writeFile({ fileName: `${safeTitle}.pptx` });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div className={`absolute top-2 right-2 z-10 ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded-lg bg-white/80 border border-gray-200 shadow-sm text-gray-500 hover:text-indigo-600 hover:bg-white hover:border-indigo-200 transition-colors text-xs"
        title="Export chart"
      >
        ↓
      </button>

      {open && (
        <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-xl shadow-xl p-4 w-60 space-y-3 z-20">
          <p className="text-xs font-semibold text-gray-700">Export Chart</p>

          {/* Size */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Width px</label>
              <input type="number" value={width} onChange={(e) => setWidth(+e.target.value)}
                className="select w-full text-xs py-0.5" min={400} max={4000} step={100} />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">Height px</label>
              <input type="number" value={height} onChange={(e) => setHeight(+e.target.value)}
                className="select w-full text-xs py-0.5" min={200} max={3000} step={100} />
            </div>
          </div>

          {/* Format toggle */}
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">Format</label>
            <div className="flex rounded overflow-hidden border border-gray-200">
              {(["png", "svg"] as const).map((f) => (
                <button key={f} onClick={() => setFmt(f)}
                  className={`flex-1 text-xs py-1 transition-colors ${fmt === f ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Download buttons */}
          <button onClick={downloadImage} disabled={busy}
            className="btn-primary w-full text-xs py-1.5">
            {busy ? "Exporting…" : `Download ${fmt.toUpperCase()}`}
          </button>
          <button onClick={exportPptx} disabled={busy}
            className="w-full text-xs py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors">
            {busy ? "Building…" : "Export to PowerPoint (.pptx)"}
          </button>

          <button onClick={() => setOpen(false)}
            className="w-full text-[10px] text-gray-400 hover:text-gray-700 py-0.5">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
