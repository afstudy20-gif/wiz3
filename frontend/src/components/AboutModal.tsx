import { X } from "lucide-react";

const VERSION = "1.5.0";
const BUILD = 86;

const CHANGELOG = [
  { ver: "1.5.0", date: "2026-04-04", notes: "Ctrl+V paste from Excel/CSV, insert column left/right, copy row/column to clipboard, proprietary license" },
  { ver: "1.4.0", date: "2026-04-03", notes: "Right-click context menu, row/column operations, fill blanks (mean/median/MICE), undo/redo, variable rename, decimal formatting" },
  { ver: "1.3.0", date: "2026-04-02", notes: "Model diagnostics, calibration, decision curve analysis, model comparison, bootstrap CI, permutation tests" },
  { ver: "1.2.0", date: "2026-04-01", notes: "Repeated measures, ANCOVA, two-way ANOVA, contextual guidance panels across all analyses" },
  { ver: "1.1.0", date: "2026-03-28", notes: "Effect sizes with CI, post-hoc testing, violin plots, global palette theme, chart export at 300 DPI" },
  { ver: "1.0.0", date: "2026-03-24", notes: "Initial release with 40+ statistical methods, clinical calculators, Table 1, PSM, power analysis" },
];

export default function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="uSTAT" className="w-10 h-10 object-contain" />
            <div>
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-bold text-gray-900">uSTAT</h2>
                <span className="text-xs font-mono text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">v{VERSION}</span>
                <span className="text-[10px] text-gray-400">build {BUILD}</span>
              </div>
              <p className="text-xs text-gray-400">Statistical Analysis Platform</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* What makes uSTAT different */}
          <div className="bg-indigo-50 rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">What makes uSTAT different</h3>
            <ul className="text-xs text-indigo-800 space-y-1.5 list-none">
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">1.</span><span><strong>Zero-code, browser-based</strong> — no syntax to learn. Point-and-click for every analysis.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">2.</span><span><strong>100% local & private</strong> — data never leaves your machine. No cloud upload required.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">3.</span><span><strong>Auto test selection</strong> — automatically picks the correct test based on normality, sample size, and variable type.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">4.</span><span><strong>Built-in clinical calculators</strong> — CHA&#x2082;DS&#x2082;-VASc, GRACE, TIMI, eGFR, H2FPEF, MAGGIC, QTc and more.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">5.</span><span><strong>One-click Table 1</strong> — publication-ready baseline characteristics with automatic p-values and Excel export.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">6.</span><span><strong>40+ statistical methods</strong> — hypothesis tests, regression, survival, ROC, PSM, power analysis, and more.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">7.</span><span><strong>Interactive charts</strong> — zoom, hover, and export at up to 600 DPI for publication.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">8.</span><span><strong>Multi-format I/O</strong> — reads and writes CSV, Excel, SPSS, SAS, and Stata files natively.</span></li>
            </ul>
          </div>

          {/* Changelog */}
          <div>
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">
              Changelog
            </h3>
            <div className="space-y-2">
              {CHANGELOG.map((entry, i) => (
                <div key={entry.ver} className={`flex gap-3 text-xs ${i === 0 ? "text-gray-800" : "text-gray-500"}`}>
                  <div className="flex-shrink-0 w-24 flex items-start gap-1.5">
                    <span className={`font-mono font-semibold ${i === 0 ? "text-indigo-600" : ""}`}>v{entry.ver}</span>
                    {i === 0 && <span className="text-[8px] bg-green-100 text-green-700 px-1 rounded font-semibold">NEW</span>}
                  </div>
                  <span className="flex-shrink-0 text-gray-400 w-20">{entry.date}</span>
                  <span className="leading-relaxed">{entry.notes}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-[10px] text-gray-400 pt-3 border-t border-gray-100 space-y-1">
            <p>All computations run locally. Your data never leaves your machine.</p>
            <p>&copy; 2026 Dr. Yusuf Ho&#x15F;o&#x11F;lu. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
