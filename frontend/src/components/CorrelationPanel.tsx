import { useState } from "react";
import Plot from "../PlotComponent";
import { useStore } from "../store";
import {
  runCorrelationPair,
  runCorrelationMatrix,
  runICC,
  runCohensKappa,
} from "../api";

// ── shared layout ────────────────────────────────────────────────────────────
const PLOT_BG: Record<string, unknown> = {
  paper_bgcolor: "transparent",
  plot_bgcolor: "#f9fafb",
  font: { color: "#374151", size: 11 },
};

const TABS = ["Pairwise", "Matrix", "ICC", "Cohen's κ"] as const;
type Tab = (typeof TABS)[number];

// ── helpers ──────────────────────────────────────────────────────────────────
function pFmt(p: number) {
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}
function sig(p: number) {
  return p < 0.05 ? "text-indigo-600 font-semibold" : "text-gray-400";
}

// ── sub-panels ───────────────────────────────────────────────────────────────

function PairwiseTab({ sessionId, columns }: { sessionId: string; columns: string[] }) {
  const numCols = columns;
  const [var1, setVar1] = useState(numCols[0] ?? "");
  const [var2, setVar2] = useState(numCols[1] ?? "");
  const [method, setMethod] = useState("auto");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    if (!var1 || !var2 || var1 === var2) {
      setError("Select two different variables");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await runCorrelationPair({ session_id: sessionId, var1, var2, method });
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-4 h-full">
      {/* Controls */}
      <div className="w-52 flex-shrink-0 space-y-4">
        <div className="panel space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Variables</h3>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Variable 1</label>
            <select className="select w-full text-sm" value={var1} onChange={(e) => setVar1(e.target.value)}>
              {numCols.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Variable 2</label>
            <select className="select w-full text-sm" value={var2} onChange={(e) => setVar2(e.target.value)}>
              {numCols.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <h3 className="text-sm font-semibold text-gray-700 pt-1">Method</h3>
          {(["auto", "pearson", "spearman"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="pw-method" value={m} checked={method === m}
                onChange={() => setMethod(m)} className="accent-indigo-500" />
              <span className="text-sm text-gray-700 capitalize">{m === "auto" ? "Auto (Shapiro-Wilk)" : m}</span>
            </label>
          ))}
          <button className="btn-primary w-full" onClick={run} disabled={loading}>
            {loading ? "Computing…" : "Compute"}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Normality box */}
        {data && (
          <div className="panel space-y-2 text-xs">
            <p className="text-gray-500 font-semibold">Shapiro-Wilk Normality</p>
            {Object.entries(data.normality as Record<string, { p: number; normal: boolean }>).map(([v, n]) => (
              <div key={v} className="flex justify-between">
                <span className="text-gray-600 truncate max-w-[110px]">{v}</span>
                <span className={n.normal ? "text-green-600" : "text-red-500"}>
                  p={pFmt(n.p)} {n.normal ? "✓" : "✗"}
                </span>
              </div>
            ))}
            <p className="text-gray-400 leading-tight">
              Method used: <span className="text-indigo-600">{data.method === "pearson" ? "Pearson r" : "Spearman ρ"}</span>
            </p>
          </div>
        )}
      </div>

      {/* Scatter plot + stats */}
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        {data ? (
          <>
            {/* Summary bar */}
            <div className="panel flex gap-6 text-sm flex-shrink-0">
              <span className="text-gray-500">
                {data.label} = <span className={`font-bold ${Math.abs(data.r) >= 0.5 ? "text-indigo-600" : "text-gray-700"}`}>
                  {data.r.toFixed(4)}
                </span>
              </span>
              <span className="text-gray-500">
                95% CI: <span className="text-gray-700">[{data.ci_low.toFixed(4)}, {data.ci_high.toFixed(4)}]</span>
              </span>
              <span className="text-gray-500">
                p = <span className={sig(data.p)}>{pFmt(data.p)}</span>
              </span>
              <span className="text-gray-400">n = {data.n}</span>
            </div>

            {/* Scatter plot */}
            <div className="panel flex-1 min-h-0">
              <Plot
                data={[
                  {
                    type: "scatter",
                    mode: "markers",
                    x: data.scatter.x,
                    y: data.scatter.y,
                    marker: { color: "#6366f1", opacity: 0.65, size: 6 },
                    name: "Data",
                    hovertemplate: `${var1}: %{x:.3f}<br>${var2}: %{y:.3f}<extra></extra>`,
                  },
                  {
                    type: "scatter",
                    mode: "lines",
                    x: data.regression_line.x,
                    y: data.regression_line.y,
                    line: { color: "#f59e0b", width: 2 },
                    name: "Regression line",
                    hoverinfo: "skip",
                  },
                  {
                    type: "scatter",
                    mode: "lines",
                    x: [...data.ci_band.x, ...[...data.ci_band.x].reverse()],
                    y: [...data.ci_band.y_upper, ...[...data.ci_band.y_lower].reverse()],
                    fill: "toself",
                    fillcolor: "rgba(245,158,11,0.12)",
                    line: { width: 0 },
                    name: "95% CI",
                    hoverinfo: "skip",
                    showlegend: true,
                  },
                ]}
                layout={{
                  ...PLOT_BG,
                  autosize: true,
                  xaxis: { title: var1, gridcolor: "#e5e7eb", zeroline: false },
                  yaxis: { title: var2, gridcolor: "#e5e7eb", zeroline: false },
                  legend: { orientation: "h", y: -0.15, font: { size: 10, color: "#374151" } },
                  annotations: [
                    {
                      xref: "paper", yref: "paper",
                      x: 0.02, y: 0.98,
                      text: `${data.label} = ${data.r.toFixed(3)}, p = ${pFmt(data.p)}`,
                      showarrow: false,
                      font: { color: "#374151", size: 12 },
                      bgcolor: "rgba(249,250,251,0.9)",
                      bordercolor: "#e5e7eb",
                      borderpad: 4,
                      borderwidth: 1,
                    },
                  ],
                  margin: { t: 20, r: 20, b: 60, l: 60 },
                }}
                style={{ width: "100%", height: "100%" }}
                useResizeHandler
                config={{ responsive: true, displayModeBar: false }}
              />
            </div>
          </>
        ) : (
          <div className="panel flex-1 flex items-center justify-center text-gray-400">
            Select two variables and click Compute
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function MatrixTab({ sessionId, columns }: { sessionId: string; columns: string[] }) {
  const [selected, setSelected] = useState<string[]>(columns.slice(0, Math.min(8, columns.length)));
  const [method, setMethod] = useState("pearson");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggle = (c: string) =>
    setSelected((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);

  const run = async () => {
    if (selected.length < 2) { setError("Select at least 2 variables"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await runCorrelationMatrix({ session_id: sessionId, variables: selected, method });
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-4 h-full">
      {/* Controls */}
      <div className="w-52 flex-shrink-0 space-y-4 overflow-y-auto">
        <div className="panel space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Method</h3>
          {["pearson", "spearman", "kendall"].map((m) => (
            <label key={m} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mx-method" value={m} checked={method === m}
                onChange={() => setMethod(m)} className="accent-indigo-500" />
              <span className="text-sm text-gray-700 capitalize">{m}</span>
            </label>
          ))}
          <h3 className="text-sm font-semibold text-gray-700 pt-1">Variables</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {columns.map((c) => (
              <label key={c} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)}
                  className="accent-indigo-500" />
                <span className="text-xs text-gray-700 truncate">{c}</span>
              </label>
            ))}
          </div>
          <button className="btn-primary w-full" onClick={run} disabled={loading}>
            {loading ? "Computing…" : "Compute"}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>

      {/* Heatmap + warnings */}
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        {data ? (
          <>
            {/* Multicollinearity warnings */}
            {data.multicollinearity_warnings.length > 0 && (
              <div className="panel flex-shrink-0 space-y-1 border-amber-200 bg-amber-50">
                <p className="text-xs font-semibold text-amber-700">
                  ⚠ Multicollinearity Warnings (|r| ≥ 0.70)
                </p>
                {data.multicollinearity_warnings.map((w: any, i: number) => (
                  <p key={i} className="text-xs text-gray-700">
                    <span className={w.severity === "high" ? "text-red-600" : "text-amber-600"}>
                      {w.var1} ↔ {w.var2}
                    </span>
                    <span className="text-gray-400 ml-2">r = {w.r.toFixed(3)}</span>
                    {w.severity === "high" && <span className="text-red-500 ml-2">⚠ High (&gt;0.90)</span>}
                  </p>
                ))}
              </div>
            )}

            {/* Heatmap */}
            <div className="panel flex-1 min-h-0">
              <Plot
                data={[{
                  type: "heatmap",
                  z: data.variables.map((c1: string) =>
                    data.variables.map((c2: string) => data.matrix[c1][c2])
                  ),
                  x: data.variables,
                  y: data.variables,
                  colorscale: "RdBu",
                  zmid: 0, zmin: -1, zmax: 1,
                  text: data.variables.map((c1: string) =>
                    data.variables.map((c2: string) => {
                      const v = data.matrix[c1][c2];
                      return v != null ? v.toFixed(2) : "";
                    })
                  ),
                  texttemplate: "%{text}",
                  hovertemplate: "%{x} vs %{y}: %{z:.4f}<extra></extra>",
                }]}
                layout={{
                  ...PLOT_BG,
                  autosize: true,
                  margin: { t: 20, r: 20, b: 100, l: 100 },
                }}
                style={{ width: "100%", height: "100%" }}
                useResizeHandler
                config={{ responsive: true, displayModeBar: false }}
              />
            </div>
          </>
        ) : (
          <div className="panel flex-1 flex items-center justify-center text-gray-400">
            Select variables and click Compute
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function ICCTab({ sessionId, columns }: { sessionId: string; columns: string[] }) {
  const [rater1, setRater1] = useState(columns[0] ?? "");
  const [rater2, setRater2] = useState(columns[1] ?? "");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    if (!rater1 || !rater2 || rater1 === rater2) { setError("Select two different columns"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await runICC({ session_id: sessionId, rater1_col: rater1, rater2_col: rater2 });
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Error");
    } finally {
      setLoading(false);
    }
  };

  const interpColor = (i: string) =>
    i === "Excellent" ? "text-green-600" : i === "Good" ? "text-emerald-600" :
    i === "Moderate" ? "text-amber-600" : "text-red-500";

  return (
    <div className="flex gap-4 h-full">
      {/* Controls */}
      <div className="w-52 flex-shrink-0 space-y-4">
        <div className="panel space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">ICC(2,1) — Absolute Agreement</h3>
          <p className="text-xs text-gray-400 leading-tight">
            Two-way mixed model for continuous inter-observer agreement (Shrout & Fleiss, 1979)
          </p>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Rater 1 Column</label>
            <select className="select w-full text-sm" value={rater1} onChange={(e) => setRater1(e.target.value)}>
              {columns.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Rater 2 Column</label>
            <select className="select w-full text-sm" value={rater2} onChange={(e) => setRater2(e.target.value)}>
              {columns.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <button className="btn-primary w-full" onClick={run} disabled={loading}>
            {loading ? "Computing…" : "Compute"}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* ICC result card */}
        {data && (
          <div className="panel space-y-2 text-sm">
            <p className="text-gray-400 text-xs font-semibold">ICC(2,1) Result</p>
            <p className="text-2xl font-bold text-gray-900">{data.icc.toFixed(3)}</p>
            <p className="text-xs text-gray-500">
              95% CI: [{data.ci_low.toFixed(3)}, {data.ci_high.toFixed(3)}]
            </p>
            <p className="text-xs text-gray-500">
              F({data.n - 1}, {data.n - 1}) = {data.f_stat.toFixed(2)}, p = {pFmt(data.f_p)}
            </p>
            <p className={`text-xs font-bold ${interpColor(data.interpretation)}`}>
              {data.interpretation}
            </p>
            <p className="text-xs text-gray-400">n = {data.n} subjects</p>
            <div className="text-xs text-gray-400 pt-1 leading-tight border-t border-gray-200 mt-1">
              <p>≥ 0.90 Excellent</p>
              <p>≥ 0.75 Good</p>
              <p>≥ 0.50 Moderate</p>
              <p>&lt; 0.50 Poor</p>
            </div>
          </div>
        )}
      </div>

      {/* Bland-Altman plot */}
      <div className="flex-1 panel min-h-0">
        {data ? (
          <Plot
            data={[
              {
                type: "scatter",
                mode: "markers",
                x: data.bland_altman.means,
                y: data.bland_altman.diffs,
                marker: { color: "#6366f1", opacity: 0.7, size: 6 },
                name: "Subjects",
                hovertemplate: "Mean: %{x:.3f}<br>Diff: %{y:.3f}<extra></extra>",
              },
            ]}
            layout={{
              ...PLOT_BG,
              autosize: true,
              xaxis: { title: `Mean of ${rater1} & ${rater2}`, gridcolor: "#e5e7eb", zeroline: false },
              yaxis: { title: `${rater1} − ${rater2}`, gridcolor: "#e5e7eb", zeroline: true, zerolinecolor: "#d1d5db" },
              shapes: [
                {
                  type: "line", xref: "paper", x0: 0, x1: 1,
                  yref: "y", y0: data.bland_altman.mean_diff, y1: data.bland_altman.mean_diff,
                  line: { color: "#f59e0b", width: 2, dash: "solid" },
                },
                {
                  type: "line", xref: "paper", x0: 0, x1: 1,
                  yref: "y", y0: data.bland_altman.loa_upper, y1: data.bland_altman.loa_upper,
                  line: { color: "#ef4444", width: 1.5, dash: "dash" },
                },
                {
                  type: "line", xref: "paper", x0: 0, x1: 1,
                  yref: "y", y0: data.bland_altman.loa_lower, y1: data.bland_altman.loa_lower,
                  line: { color: "#ef4444", width: 1.5, dash: "dash" },
                },
              ],
              annotations: [
                {
                  xref: "paper", yref: "y", x: 1.01, y: data.bland_altman.mean_diff,
                  text: `Bias: ${data.bland_altman.mean_diff.toFixed(3)}`,
                  showarrow: false, font: { color: "#b45309", size: 10 }, xanchor: "left",
                },
                {
                  xref: "paper", yref: "y", x: 1.01, y: data.bland_altman.loa_upper,
                  text: `+1.96 SD: ${data.bland_altman.loa_upper.toFixed(3)}`,
                  showarrow: false, font: { color: "#dc2626", size: 10 }, xanchor: "left",
                },
                {
                  xref: "paper", yref: "y", x: 1.01, y: data.bland_altman.loa_lower,
                  text: `−1.96 SD: ${data.bland_altman.loa_lower.toFixed(3)}`,
                  showarrow: false, font: { color: "#dc2626", size: 10 }, xanchor: "left",
                },
              ],
              margin: { t: 20, r: 130, b: 60, l: 60 },
              title: { text: "Bland-Altman Plot", font: { color: "#374151", size: 12 } },
            }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
            config={{ responsive: true, displayModeBar: false }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            Select two rater columns and click Compute
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function KappaTab({ sessionId, columns }: { sessionId: string; columns: string[] }) {
  const [rater1, setRater1] = useState(columns[0] ?? "");
  const [rater2, setRater2] = useState(columns[1] ?? "");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    if (!rater1 || !rater2 || rater1 === rater2) { setError("Select two different columns"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await runCohensKappa({ session_id: sessionId, rater1_col: rater1, rater2_col: rater2 });
      setData(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Error");
    } finally {
      setLoading(false);
    }
  };

  const interpColor = (i: string) =>
    i === "Almost Perfect" ? "text-green-600" : i === "Substantial" ? "text-emerald-600" :
    i === "Moderate" ? "text-amber-600" : i === "Fair" ? "text-orange-500" : "text-red-500";

  return (
    <div className="flex gap-4 h-full">
      {/* Controls */}
      <div className="w-52 flex-shrink-0 space-y-4">
        <div className="panel space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Cohen's Kappa</h3>
          <p className="text-xs text-gray-400 leading-tight">
            Categorical inter-observer agreement (Landis & Koch, 1977)
          </p>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Rater 1 Column</label>
            <select className="select w-full text-sm" value={rater1} onChange={(e) => setRater1(e.target.value)}>
              {columns.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Rater 2 Column</label>
            <select className="select w-full text-sm" value={rater2} onChange={(e) => setRater2(e.target.value)}>
              {columns.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <button className="btn-primary w-full" onClick={run} disabled={loading}>
            {loading ? "Computing…" : "Compute"}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Kappa result card */}
        {data && (
          <div className="panel space-y-2 text-sm">
            <p className="text-gray-400 text-xs font-semibold">κ Result</p>
            <p className="text-2xl font-bold text-gray-900">{data.kappa.toFixed(3)}</p>
            <p className="text-xs text-gray-500">
              95% CI: [{data.ci_low.toFixed(3)}, {data.ci_high.toFixed(3)}]
            </p>
            <p className="text-xs text-gray-500">SE = {data.se.toFixed(4)}</p>
            <p className={`text-xs font-bold ${interpColor(data.interpretation)}`}>
              {data.interpretation}
            </p>
            <p className="text-xs text-gray-400">n = {data.n}</p>
            <div className="text-xs text-gray-400 pt-1 leading-tight border-t border-gray-200 mt-1">
              <p>&gt; 0.81 Almost Perfect</p>
              <p>0.61–0.80 Substantial</p>
              <p>0.41–0.60 Moderate</p>
              <p>0.21–0.40 Fair</p>
              <p>0.00–0.20 Slight</p>
            </div>
          </div>
        )}
      </div>

      {/* Confusion matrix heatmap */}
      <div className="flex-1 panel min-h-0">
        {data ? (
          <Plot
            data={[{
              type: "heatmap",
              z: data.confusion_matrix,
              x: data.labels.map((l: string) => `Rater2: ${l}`),
              y: data.labels.map((l: string) => `Rater1: ${l}`),
              colorscale: [[0, "#f9fafb"], [1, "#6366f1"]],
              showscale: false,
              text: data.confusion_matrix.map((row: number[]) => row.map((v: number) => String(v))),
              texttemplate: "%{text}",
              hovertemplate: "Rater1=%{y}<br>Rater2=%{x}<br>Count=%{z}<extra></extra>",
            }]}
            layout={{
              ...PLOT_BG,
              autosize: true,
              title: { text: "Confusion Matrix", font: { color: "#374151", size: 13 } },
              margin: { t: 50, r: 20, b: 80, l: 100 },
              xaxis: { side: "bottom" },
            }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
            config={{ responsive: true, displayModeBar: false }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            Select two rater columns and click Compute
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function CorrelationPanel() {
  const session = useStore((s) => s.session);
  if (!session) return null;

  const columns: string[] = (session.columns ?? []).map((c) => c.name);
  const [activeTab, setActiveTab] = useState<Tab>("Pairwise");

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Tab bar */}
      <div className="flex gap-1 flex-shrink-0">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              activeTab === t
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === "Pairwise" && <PairwiseTab sessionId={session.session_id} columns={columns} />}
        {activeTab === "Matrix" && <MatrixTab sessionId={session.session_id} columns={columns} />}
        {activeTab === "ICC" && <ICCTab sessionId={session.session_id} columns={columns} />}
        {activeTab === "Cohen's κ" && <KappaTab sessionId={session.session_id} columns={columns} />}
      </div>
    </div>
  );
}
