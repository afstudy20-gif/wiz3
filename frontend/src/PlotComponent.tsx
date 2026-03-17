// Vite requires explicit default export handling for react-plotly.js (CJS module)
import _Plot from "react-plotly.js";
const Plot = (_Plot as any).default ?? _Plot;
export default Plot;
