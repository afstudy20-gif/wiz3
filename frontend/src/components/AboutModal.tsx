import { X } from "lucide-react";

const VERSION = "1.4.0";
const BUILD = 81;

const CHANGELOG = [
  { ver: "1.4.0", date: "2026-04-03", notes: "Right-click context menu (rename, delete, fill blanks, send to end), row delete, XLSX export fix, persist results across tabs, variable rename" },
  { ver: "1.3.0", date: "2026-04-02", notes: "Diagnostics (VIF, Cook's, Breusch-Pagan, White), model diagnostics (calibration, Brier, Hosmer-Lemeshow, Schoenfeld PH), DCA, model comparison, bootstrap CI, permutation tests" },
  { ver: "1.2.0", date: "2026-04-01", notes: "Repeated measures (paired t-test, Wilcoxon SR, Friedman, RM ANOVA, mixed ANOVA), ANCOVA, two-way ANOVA, test guidance panels" },
  { ver: "1.1.0", date: "2026-03-28", notes: "Effect sizes with CI for all tests, post-hoc testing (Tukey, Games-Howell, Dunn), violin plots, global palette theme, PlotExporter on all charts" },
  { ver: "1.0.0", date: "2026-03-24", notes: "PSM, power analysis redesign, normality fixes (Lilliefors, CLT bypass), DeLong CI, LMM guards, binary auto-detection, tertile/quartile, clinical calculators" },
  { ver: "0.9.0", date: "2026-03-19", notes: "Initial release: data import (CSV/Excel/SPSS/SAS/Stata), descriptive stats, hypothesis testing, correlation, ROC, regression models, Table 1, compute engine" },
];

const ABOUT_SECTIONS = [
  {
    title: "Hypothesis Testing",
    items: [
      ["Independent t-test", "scipy.stats.ttest_ind"],
      ["Paired t-test", "scipy.stats.ttest_rel"],
      ["Mann-Whitney U", "scipy.stats.mannwhitneyu"],
      ["Wilcoxon signed-rank", "scipy.stats.wilcoxon"],
      ["One-way ANOVA", "scipy.stats.f_oneway"],
      ["Kruskal-Wallis H", "scipy.stats.kruskal"],
      ["Chi-square test", "scipy.stats.chi2_contingency"],
      ["Fisher's exact test", "scipy.stats.fisher_exact"],
    ],
  },
  {
    title: "Normality & Diagnostics",
    items: [
      ["Shapiro-Wilk (n \u2264 2000)", "scipy.stats.shapiro"],
      ["Lilliefors (n > 2000)", "statsmodels.stats.diagnostic.lilliefors"],
      ["Skewness (CLT bypass)", "scipy.stats.skew"],
      ["Levene's test", "scipy.stats.levene"],
    ],
  },
  {
    title: "Correlation & Agreement",
    items: [
      ["Pearson r", "scipy.stats.pearsonr"],
      ["Spearman \u03C1", "scipy.stats.spearmanr"],
      ["ICC", "statsmodels (mixed model)"],
      ["Cohen's Kappa", "sklearn.metrics.cohen_kappa_score"],
    ],
  },
  {
    title: "Regression Models",
    items: [
      ["Linear (OLS)", "statsmodels.api.OLS"],
      ["Logistic", "statsmodels.api.Logit"],
      ["Poisson", "statsmodels.genmod.GLM (Poisson)"],
      ["Negative Binomial", "statsmodels.genmod.GLM (NegBin)"],
      ["Gamma", "statsmodels.genmod.GLM (Gamma)"],
      ["Polynomial", "statsmodels.api.OLS (poly terms)"],
      ["RCS dose-response", "statsmodels.api.Logit + custom spline basis"],
    ],
  },
  {
    title: "Mixed Models & GEE",
    items: [
      ["Linear Mixed Model (LMM)", "statsmodels.formula.api.mixedlm"],
      ["GEE (binary clustered)", "statsmodels.genmod.GEE (Binomial)"],
    ],
  },
  {
    title: "Survival Analysis",
    items: [
      ["Kaplan-Meier", "lifelines.KaplanMeierFitter"],
      ["Log-rank test", "lifelines.statistics.logrank_test"],
      ["Cox Proportional Hazards", "lifelines.CoxPHFitter"],
    ],
  },
  {
    title: "ROC & Diagnostic Accuracy",
    items: [
      ["ROC curve & AUC", "sklearn.metrics.roc_curve, roc_auc_score"],
      ["Youden's index / optimal cut-off", "numpy (argmax J = sens + spec - 1)"],
      ["DeLong test (AUC comparison)", "Custom implementation (Mann-Whitney placements)"],
      ["95% CI of AUC", "DeLong variance-covariance matrix"],
    ],
  },
  {
    title: "Power Analysis",
    items: [
      ["Two-sample t-test", "statsmodels.stats.power.TTestIndPower"],
      ["Paired t-test", "statsmodels.stats.power.TTestPower"],
      ["ANOVA (F-test)", "statsmodels.stats.power.FTestAnovaPower"],
      ["Chi-square", "statsmodels.stats.power.GofChisquarePower"],
      ["Correlation", "statsmodels.stats.power.NormalIndPower"],
      ["Survival (log-rank)", "scipy.stats.norm (Schoenfeld formula)"],
    ],
  },
  {
    title: "Propensity Score Matching",
    items: [
      ["Logistic PS model", "sklearn.linear_model.LogisticRegression"],
      ["Nearest-neighbor matching", "sklearn.neighbors.NearestNeighbors (KD-tree)"],
      ["SMD (balance check)", "Custom (Austin 2011 formula)"],
      ["Outcome analysis", "statsmodels.api.Logit (matched cohort)"],
    ],
  },
  {
    title: "Data I/O",
    items: [
      ["CSV", "pandas.read_csv"],
      ["Excel (.xlsx/.xls)", "pandas.read_excel (openpyxl)"],
      ["SPSS (.sav)", "pyreadstat.read_sav"],
      ["SAS (.sas7bdat)", "pyreadstat.read_sas7bdat"],
      ["Stata (.dta)", "pyreadstat.read_dta"],
      ["Export XLSX", "openpyxl"],
      ["Export SPSS", "pyreadstat.write_sav"],
    ],
  },
  {
    title: "Compute & Transform",
    items: [
      ["Formula engine", "pandas.DataFrame.eval"],
      ["Recode (IF-THEN)", "numpy.select"],
      ["Tertile / Quartile", "pandas.qcut"],
      ["Z-score, Ln, Log, Sqrt, etc.", "numpy / scipy"],
      ["Clinical scores (15+)", "Custom implementations (BMI, eGFR, CHA\u2082DS\u2082-VASc, GRACE, etc.)"],
    ],
  },
  {
    title: "Visualization",
    items: [
      ["All interactive charts", "Plotly.js (react-plotly.js)"],
      ["Frontend framework", "React 18 + TypeScript + Vite"],
      ["Styling", "Tailwind CSS"],
      ["Backend framework", "FastAPI + Uvicorn"],
    ],
  },
];

export default function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
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
          <p className="text-sm text-gray-600">
            uSTAT is built on open-source Python and JavaScript libraries.
            Below is a reference of the statistical methods and the packages that power each analysis.
          </p>

          <div className="bg-indigo-50 rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">What makes uSTAT different</h3>
            <ul className="text-xs text-indigo-800 space-y-1.5 list-none">
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">1.</span><span><strong>Zero-code, browser-based</strong> — no syntax to learn (unlike R, SAS, Stata). Point-and-click for every analysis.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">2.</span><span><strong>100% local & private</strong> — data never leaves your machine. No cloud upload, no licence server, no IT approval needed.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">3.</span><span><strong>Free & open-source</strong> — no annual licence fees (SPSS ~$1,300/yr, SAS ~$8,000/yr, Stata ~$600/yr).</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">4.</span><span><strong>Auto test selection</strong> — automatically picks the correct test (parametric vs non-parametric) based on normality, sample size, and variable type.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">5.</span><span><strong>Built-in clinical calculators</strong> — CHA₂DS₂-VASc, GRACE, TIMI, eGFR, H2FPEF, MAGGIC, QTc and more — not available in any general-purpose statistics package.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">6.</span><span><strong>One-click Table 1</strong> — publication-ready baseline characteristics table with automatic p-values, footnotes, and Excel export.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">7.</span><span><strong>Interactive Plotly charts</strong> — zoom, hover, export — vs static output in SPSS/SAS/Stata.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">8.</span><span><strong>Multi-format I/O</strong> — reads CSV, Excel, SPSS (.sav), SAS (.sas7bdat), Stata (.dta) natively. No extra modules or conversion steps.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">9.</span><span><strong>Propensity Score Matching</strong> — full PSM pipeline (logistic model → nearest-neighbor matching → SMD balance → outcome analysis) in a single panel.</span></li>
              <li className="flex gap-2"><span className="text-indigo-400 flex-shrink-0">10.</span><span><strong>Instant setup</strong> — no installation wizard, no environment config. One command to start the backend, open the browser, and begin analysing.</span></li>
            </ul>
          </div>

          {ABOUT_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">
                {section.title}
              </h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                {section.items.map(([method, pkg]) => (
                  <div key={method} className="flex items-baseline gap-2 py-0.5">
                    <span className="text-xs text-gray-700">{method}</span>
                    <span className="flex-1 border-b border-dotted border-gray-200" />
                    <code className="text-[10px] text-indigo-600 font-mono whitespace-nowrap">{pkg}</code>
                  </div>
                ))}
              </div>
            </div>
          ))}

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

          <div className="text-[10px] text-gray-400 pt-2 border-t border-gray-100">
            All computations run server-side via FastAPI. Data never leaves your machine.
          </div>
        </div>
      </div>
    </div>
  );
}
