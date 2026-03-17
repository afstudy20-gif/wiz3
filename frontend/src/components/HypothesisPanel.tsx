import { useState } from "react";
import { useStore } from "../store";
import { runTTest, runChiSquare, runAnova, runMannWhitney, runFisher, runKruskal } from "../api";

const TESTS = [
  { id: "ttest_1sample",  label: "One-sample t-test",     group: "Parametric" },
  { id: "ttest_2sample",  label: "Independent t-test",    group: "Parametric" },
  { id: "anova",          label: "One-way ANOVA",         group: "Parametric" },
  { id: "mannwhitney",    label: "Mann-Whitney U",        group: "Non-parametric" },
  { id: "kruskal",        label: "Kruskal-Wallis",        group: "Non-parametric" },
  { id: "chisquare",      label: "Chi-square",            group: "Categorical" },
  { id: "fisher",         label: "Fisher's exact",        group: "Categorical" },
];

function ResultCard({ result }: { result: any }) {
  const fmt = (v: any) => {
    if (typeof v !== "number") return String(v);
    if (Math.abs(v) < 0.001 && v !== 0) return v.toExponential(3);
    return v.toFixed(4);
  };

  const skip = ["test", "interpretation", "significant", "crosstab", "groups",
                "table", "row_labels", "col_labels", "curve"];

  return (
    <div className="panel space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900">{result.test}</h4>
        {"significant" in result && (
          <span className={result.significant ? "badge-sig" : "badge-ns"}>
            {result.significant ? "Significant" : "Not significant"}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 italic">{result.interpretation}</p>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {Object.entries(result)
          .filter(([k]) => !skip.includes(k))
          .map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-gray-100 py-1">
              <span className="text-gray-400">{k}</span>
              <span className="text-gray-700 font-mono">{fmt(v)}</span>
            </div>
          ))}
      </div>

      {result.groups && (
        <div className="overflow-auto rounded border border-gray-200 mt-2">
          <table>
            <thead>
              <tr>{Object.keys(result.groups[0]).map((k) => <th key={k}>{k}</th>)}</tr>
            </thead>
            <tbody>
              {result.groups.map((g: any, i: number) => (
                <tr key={i}>{Object.values(g).map((v: any, j) => (
                  <td key={j}>{typeof v === "number" ? fmt(v) : v}</td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.table && (
        <div className="overflow-auto rounded border border-gray-200 mt-2">
          <table>
            <thead>
              <tr>
                <th></th>
                {result.col_labels.map((l: string) => <th key={l}>{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.table.map((row: number[], i: number) => (
                <tr key={i}>
                  <td className="font-medium text-gray-900">{result.row_labels[i]}</td>
                  {row.map((v, j) => <td key={j}>{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function HypothesisPanel() {
  const session = useStore((s) => s.session);
  if (!session) return null;

  const numCols = session.columns.filter((c) => c.kind === "numeric").map((c) => c.name);
  const catCols = session.columns.filter((c) => c.kind === "categorical").map((c) => c.name);

  const [test, setTest] = useState("ttest_1sample");
  const [col, setCol] = useState(numCols[0] ?? "");
  const [col2, setCol2] = useState(catCols[1] ?? catCols[0] ?? "");
  const [groupCol, setGroupCol] = useState(catCols[0] ?? "");
  const [mu, setMu] = useState("0");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isCat = test === "chisquare" || test === "fisher";
  const needsGroup = ["ttest_2sample", "anova", "mannwhitney", "kruskal"].includes(test);
  const needsSecondCat = isCat;

  const run = async () => {
    setLoading(true); setError(null); setResult(null);
    const sid = session.session_id;
    try {
      let res: any;
      if (test === "ttest_1sample")  res = await runTTest({ session_id: sid, column: col, mu: +mu });
      else if (test === "ttest_2sample") res = await runTTest({ session_id: sid, column: col, group_column: groupCol });
      else if (test === "anova")     res = await runAnova({ session_id: sid, column: col, group_column: groupCol });
      else if (test === "mannwhitney") res = await runMannWhitney({ session_id: sid, column: col, group_column: groupCol });
      else if (test === "kruskal")   res = await runKruskal({ session_id: sid, column: col, group_column: groupCol });
      else if (test === "chisquare") res = await runChiSquare({ session_id: sid, row_column: col, col_column: col2 });
      else if (test === "fisher")    res = await runFisher({ session_id: sid, row_column: col, col_column: col2 });
      setResult(res?.data);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Error");
    } finally { setLoading(false); }
  };

  const groups = ["Parametric", "Non-parametric", "Categorical"];

  return (
    <div className="flex gap-4">
      <div className="w-64 flex-shrink-0 space-y-4">
        <div className="panel space-y-1">
          {groups.map((grp) => (
            <div key={grp}>
              <p className="text-xs text-gray-400 uppercase tracking-wider mt-3 mb-1 first:mt-0">{grp}</p>
              {TESTS.filter((t) => t.group === grp).map(({ id, label }) => (
                <label key={id} className="flex items-center gap-2 cursor-pointer py-0.5">
                  <input type="radio" name="test" value={id} checked={test === id}
                    onChange={() => { setTest(id); setResult(null); }} className="accent-indigo-500" />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>

        <div className="panel space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Variables</h3>
          <div>
            <label className="text-xs text-gray-400 block mb-1">
              {isCat ? "Row column" : "Outcome column"}
            </label>
            <select className="select w-full" value={col} onChange={(e) => setCol(e.target.value)}>
              {(isCat ? catCols : numCols).map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          {test === "ttest_1sample" && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Test value (μ₀)</label>
              <input className="select w-full" type="number" value={mu} onChange={(e) => setMu(e.target.value)} />
            </div>
          )}

          {needsGroup && catCols.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Group column</label>
              <select className="select w-full" value={groupCol} onChange={(e) => setGroupCol(e.target.value)}>
                {catCols.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}

          {needsSecondCat && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Column variable</label>
              <select className="select w-full" value={col2} onChange={(e) => setCol2(e.target.value)}>
                {catCols.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}

          <button className="btn-primary w-full" onClick={run} disabled={loading}>
            {loading ? "Running…" : "Run Test"}
          </button>
          {error && <p className="text-red-500 text-xs">{error}</p>}
        </div>
      </div>

      <div className="flex-1">
        {result ? <ResultCard result={result} /> : (
          <div className="panel h-64 flex items-center justify-center text-gray-400">
            Configure and run a hypothesis test
          </div>
        )}
      </div>
    </div>
  );
}
