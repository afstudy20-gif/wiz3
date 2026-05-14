import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, AlertTriangle, Code as CodeIcon, Image as ImageIcon } from "lucide-react";
import { useStore } from "../store";
import {
  codeRunnerStatus,
  runCode,
  type CodeRunResponse,
  type CodeRunnerStatus,
} from "../api";

interface Template {
  id: string;
  label: string;
  code: string;
}

const TEMPLATES: Template[] = [
  {
    id: "step1_harrell",
    label: "Step 1 — Univariate Cox-RCS (Harrell knots 5/35/65/95)",
    code: `# Step 1 — Univariate Cox-RCS on LDL → mortality
# Harrell percentile knots (primary analysis)
import numpy as np
import pandas as pd
from lifelines import CoxPHFitter
import matplotlib.pyplot as plt

# Adjust column names if needed:
DUR, EVT, X = "time", "event", "LDL"

def rcs_basis(x, knots):
    k = len(knots); kk = knots[-1]; k1 = knots[-2]
    denom = (kk - knots[0])**2
    cols = []
    for j in range(k - 2):
        t1 = np.maximum(x - knots[j], 0)**3
        t2 = np.maximum(x - k1, 0)**3
        t3 = np.maximum(x - kk, 0)**3
        col = t1 - ((kk - knots[j])/(kk - k1))*t2 + ((k1 - knots[j])/(kk - k1))*t3
        cols.append(col / denom)
    return np.column_stack(cols)

d = df[[DUR, EVT, X]].dropna().copy()
x = d[X].values.astype(float)
knots = np.percentile(x, [5, 35, 65, 95])
print("Harrell knots:", np.round(knots, 2))

sp = rcs_basis(x, knots)
fit = d.assign(x_lin=x, sp_1=sp[:, 0], sp_2=sp[:, 1])[[DUR, EVT, "x_lin", "sp_1", "sp_2"]]
cph = CoxPHFitter().fit(fit, duration_col=DUR, event_col=EVT)
print(cph.summary[["coef", "exp(coef)", "p"]])
print(f"\\nC-index = {cph.concordance_index_:.3f}, n_events = {int(d[EVT].sum())}")
`,
  },
  {
    id: "step1_clinical",
    label: "Step 1b — Univariate Cox-RCS (clinical knots 70/100/130/160)",
    code: `# Step 1b — Same model with CLINICAL knot positions (sensitivity analysis)
import numpy as np
from lifelines import CoxPHFitter

DUR, EVT, X = "time", "event", "LDL"
CLINICAL_KNOTS = np.array([70, 100, 130, 160], dtype=float)

def rcs_basis(x, knots):
    k = len(knots); kk = knots[-1]; k1 = knots[-2]
    denom = (kk - knots[0])**2
    cols = []
    for j in range(k - 2):
        t1 = np.maximum(x - knots[j], 0)**3
        t2 = np.maximum(x - k1, 0)**3
        t3 = np.maximum(x - kk, 0)**3
        col = t1 - ((kk - knots[j])/(kk - k1))*t2 + ((k1 - knots[j])/(kk - k1))*t3
        cols.append(col / denom)
    return np.column_stack(cols)

d = df[[DUR, EVT, X]].dropna().copy()
x = d[X].values.astype(float)
sp = rcs_basis(x, CLINICAL_KNOTS)
fit = d.assign(x_lin=x, sp_1=sp[:, 0], sp_2=sp[:, 1])[[DUR, EVT, "x_lin", "sp_1", "sp_2"]]
cph = CoxPHFitter().fit(fit, duration_col=DUR, event_col=EVT)
print("Clinical knots:", CLINICAL_KNOTS.tolist())
print(cph.summary[["coef", "exp(coef)", "p"]])
`,
  },
  {
    id: "step2_multivariable",
    label: "Step 2 — Multivariable Cox-RCS (LDL + AGE + covariates)",
    code: `# Step 2 — Surv(time, event) ~ rcs(LDL, 4) + rcs(AGE, 4) + SEX + DM + HT + SMOKER
import numpy as np
import pandas as pd
from lifelines import CoxPHFitter

DUR, EVT = "time", "event"
SPLINE_VARS = ["LDL", "AGE"]
COVARIATES  = ["SEX", "DM", "HT", "SMOKER"]

def rcs_basis(x, knots):
    k = len(knots); kk = knots[-1]; k1 = knots[-2]
    denom = (kk - knots[0])**2
    cols = []
    for j in range(k - 2):
        t1 = np.maximum(x - knots[j], 0)**3
        t2 = np.maximum(x - k1, 0)**3
        t3 = np.maximum(x - kk, 0)**3
        col = t1 - ((kk - knots[j])/(kk - k1))*t2 + ((k1 - knots[j])/(kk - k1))*t3
        cols.append(col / denom)
    return np.column_stack(cols)

cols_needed = [DUR, EVT] + SPLINE_VARS + COVARIATES
d = df[cols_needed].dropna().copy()

out = pd.DataFrame({DUR: d[DUR].values, EVT: d[EVT].values})
for v in SPLINE_VARS:
    x = d[v].values.astype(float)
    knots = np.percentile(x, [5, 35, 65, 95])
    sp = rcs_basis(x, knots)
    out[f"{v}_lin"] = x
    for i in range(sp.shape[1]):
        out[f"{v}_sp{i+1}"] = sp[:, i]
for c in COVARIATES:
    out[c] = pd.to_numeric(d[c], errors="coerce")

out = out.dropna()
cph = CoxPHFitter().fit(out, duration_col=DUR, event_col=EVT)
print(cph.summary[["coef", "exp(coef)", "p"]].round(3))
print(f"\\nn = {len(out)}, events = {int(out[EVT].sum())}, C-index = {cph.concordance_index_:.3f}")
`,
  },
  {
    id: "step3_interaction",
    label: "Step 3 — RCS × RCS interaction (LR test)",
    code: `# Step 3 — Surv(time, event) ~ rcs(LDL, 4) * rcs(AGE, 4) + covariates
# Tests whether the LDL-mortality relationship varies with age.
import numpy as np
import pandas as pd
from lifelines import CoxPHFitter
from scipy.stats import chi2

DUR, EVT = "time", "event"
SPLINE_VARS = ["LDL", "AGE"]
COVARIATES  = ["SEX", "DM", "HT", "SMOKER"]

def rcs_basis(x, knots):
    k = len(knots); kk = knots[-1]; k1 = knots[-2]
    denom = (kk - knots[0])**2
    cols = []
    for j in range(k - 2):
        t1 = np.maximum(x - knots[j], 0)**3
        t2 = np.maximum(x - k1, 0)**3
        t3 = np.maximum(x - kk, 0)**3
        col = t1 - ((kk - knots[j])/(kk - k1))*t2 + ((k1 - knots[j])/(kk - k1))*t3
        cols.append(col / denom)
    return np.column_stack(cols)

d = df[[DUR, EVT] + SPLINE_VARS + COVARIATES].dropna().copy()

bases = {}
for v in SPLINE_VARS:
    x = d[v].values.astype(float)
    knots = np.percentile(x, [5, 35, 65, 95])
    bases[v] = np.column_stack([x, rcs_basis(x, knots)])  # linear + spline cols

main = pd.DataFrame({DUR: d[DUR].values, EVT: d[EVT].values})
for v in SPLINE_VARS:
    for i in range(bases[v].shape[1]):
        main[f"{v}_c{i+1}"] = bases[v][:, i]
for c in COVARIATES:
    main[c] = pd.to_numeric(d[c], errors="coerce")
main = main.dropna()

cph_red = CoxPHFitter().fit(main, duration_col=DUR, event_col=EVT)

# Tensor-product interaction columns
a, b = bases[SPLINE_VARS[0]], bases[SPLINE_VARS[1]]
ix_cols = {}
for i in range(a.shape[1]):
    for j in range(b.shape[1]):
        ix_cols[f"ix_{SPLINE_VARS[0]}{i+1}_{SPLINE_VARS[1]}{j+1}"] = a[:, i] * b[:, j]
full = main.assign(**ix_cols)
cph_full = CoxPHFitter().fit(full, duration_col=DUR, event_col=EVT)

lr_stat = 2 * (cph_full.log_likelihood_ - cph_red.log_likelihood_)
dof = len(ix_cols)
p = chi2.sf(lr_stat, dof)
print(f"Interaction LR test: χ²({dof}) = {lr_stat:.2f}, p = {p:.4f}")
print(f"\\nFull model AIC partial = {cph_full.AIC_partial_:.1f}")
print(f"Reduced model AIC partial = {cph_red.AIC_partial_:.1f}")
`,
  },
];

export default function CodePanel() {
  const session = useStore((s) => s.session);
  const [code, setCode] = useState<string>(TEMPLATES[0].code);
  const [timeout, setTimeoutSec] = useState<number>(30);
  const [running, setRunning] = useState<boolean>(false);
  const [output, setOutput] = useState<CodeRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CodeRunnerStatus | null>(null);
  const [tab, setTab] = useState<"console" | "figures">("console");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    codeRunnerStatus()
      .then((r) => setStatus(r.data))
      .catch(() => setStatus({ enabled: false, max_timeout_s: 60, max_code_bytes: 102400, rate_limit_per_min: 6, rate_limit_per_hour: 30 }));
  }, []);

  const codeBytes = useMemo(() => new Blob([code]).size, [code]);

  const handleRun = async () => {
    if (!session) {
      setError("Upload a dataset first — sandbox needs a session DataFrame.");
      return;
    }
    if (!status?.enabled) {
      setError("Code runner is disabled on this server (set ENABLE_CODE_RUNNER=1 to enable).");
      return;
    }
    setRunning(true);
    setError(null);
    setOutput(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await runCode({ session_id: session.session_id, code, timeout }, ctrl.signal);
      setOutput(res.data);
      if (res.data.figures.length > 0) setTab("figures");
      else setTab("console");
    } catch (e: any) {
      if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") {
        setError("Run cancelled.");
      } else {
        setError(e?.response?.data?.detail ?? e?.message ?? "Run failed");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const onTab = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = code.substring(0, start) + "    " + code.substring(end);
    setCode(next);
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 4; });
  };

  if (!session) {
    return (
      <div className="p-6 text-center text-gray-500 text-sm">
        Upload a dataset to access the Python code sandbox. The session DataFrame is injected as <code>df</code> in your code.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Warning banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-start gap-2">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
        <div>
          Code runs in a sandboxed Python subprocess on the server. Your session is injected as <code>df</code>. CPU {timeout} s / RAM 512 MB hard limits. No network access. Imports are restricted to numpy, pandas, scipy, statsmodels, lifelines, scikit-learn, matplotlib, seaborn and stdlib modules.
          {!status?.enabled && (
            <span className="block mt-1 font-semibold text-amber-800">
              Code runner is disabled on this server. Set ENABLE_CODE_RUNNER=1 and restart to enable.
            </span>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white flex-wrap">
        <select
          className="select text-xs py-1"
          onChange={(e) => {
            const t = TEMPLATES.find((x) => x.id === e.target.value);
            if (t) setCode(t.code);
          }}
          defaultValue=""
        >
          <option value="" disabled>Insert template…</option>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <select
          className="select text-xs py-1"
          value={timeout}
          onChange={(e) => setTimeoutSec(parseInt(e.target.value, 10))}
        >
          <option value={10}>10 s</option>
          <option value={30}>30 s</option>
          <option value={60}>60 s</option>
        </select>
        <span className="text-[10px] text-gray-400 ml-auto">{codeBytes.toLocaleString()} / {status?.max_code_bytes?.toLocaleString() ?? "100000"} bytes</span>
        {running ? (
          <button onClick={handleStop} className="btn-secondary flex items-center gap-1 text-xs py-1 px-3">
            <Square size={12} /> Stop
          </button>
        ) : (
          <button
            onClick={handleRun}
            disabled={!status?.enabled}
            className="btn-primary flex items-center gap-1 text-xs py-1 px-3 disabled:opacity-50"
            title={!status?.enabled ? "Code runner disabled on this server" : ""}
          >
            <Play size={12} /> Run
          </button>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 min-h-[200px] border-b border-gray-200">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={onTab}
            spellCheck={false}
            className="w-full h-full font-mono text-xs leading-snug p-3 outline-none resize-none bg-gray-900 text-gray-100"
            placeholder="# Python code. The session DataFrame is available as `df`."
          />
        </div>

        {/* Output */}
        <div className="h-72 flex flex-col bg-white">
          <div className="flex items-center gap-1 px-3 pt-2 border-b border-gray-200">
            <button onClick={() => setTab("console")}
              className={`px-2 py-1 text-xs font-medium rounded-t border-b-2 transition-colors ${tab === "console" ? "border-indigo-500 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <CodeIcon size={12} className="inline mr-1" /> Console
            </button>
            <button onClick={() => setTab("figures")}
              className={`px-2 py-1 text-xs font-medium rounded-t border-b-2 transition-colors ${tab === "figures" ? "border-indigo-500 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <ImageIcon size={12} className="inline mr-1" /> Figures
              {output && output.figures.length > 0 && <span className="ml-1 text-[9px] text-indigo-500">({output.figures.length})</span>}
            </button>
            <div className="ml-auto text-[10px] text-gray-400">
              {output && (
                <>exit={output.exit_code} · {output.time_used_s.toFixed(2)} s{output.timed_out ? " · ⚠ timed out" : ""}</>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto p-3 font-mono text-xs">
            {error && (
              <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 whitespace-pre-wrap break-words">{error}</div>
            )}
            {tab === "console" && output && (
              <div className="space-y-2">
                {output.error && (
                  <pre className="p-2 bg-red-50 border border-red-200 text-red-700 rounded whitespace-pre-wrap">{output.error}</pre>
                )}
                {output.stdout && (
                  <pre className="whitespace-pre-wrap text-gray-800">{output.stdout}</pre>
                )}
                {output.stderr && (
                  <pre className="whitespace-pre-wrap text-amber-700">{output.stderr}</pre>
                )}
                {!output.error && !output.stdout && !output.stderr && (
                  <div className="text-gray-400">(no output)</div>
                )}
              </div>
            )}
            {tab === "figures" && output && (
              output.figures.length === 0 ? (
                <div className="text-gray-400">(no figures)</div>
              ) : (
                <div className="space-y-4">
                  {output.figures.map((b64, i) => (
                    <div key={i} className="border border-gray-200 rounded overflow-hidden bg-white">
                      <img alt={`figure ${i + 1}`} src={`data:image/png;base64,${b64}`} className="max-w-full" />
                    </div>
                  ))}
                </div>
              )
            )}
            {!output && !error && (
              <div className="text-gray-400">Click Run to execute. Output and figures appear here.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
