/**
 * Centralized plot style system.
 * All Plotly charts should merge `usePlotLayout()` into their layout prop.
 */
import { useStore, PALETTES } from "./store";

/** Returns a base Plotly layout object that reflects the current global theme. */
export function usePlotLayout(overrides?: Record<string, unknown>): Record<string, unknown> {
  const theme   = useStore((s) => s.plotTheme);
  const showGrid = useStore((s) => s.showGrid);
  const gc = showGrid ? "#e5e7eb" : "transparent";

  return {
    paper_bgcolor: "transparent",
    plot_bgcolor:  theme.plotBg,
    font: { family: theme.fontFamily, color: "#374151", size: theme.fontSize },
    colorway: PALETTES[theme.palette],
    xaxis: { gridcolor: gc, zeroline: false },
    yaxis: { gridcolor: gc, zeroline: false },
    ...overrides,
  };
}

/** Returns the primary color palette array for the current theme. */
export function usePalette(): string[] {
  const theme = useStore((s) => s.plotTheme);
  return PALETTES[theme.palette];
}

/** Returns default marker / line props for the current theme. */
export function useTraceDefaults() {
  const theme = useStore((s) => s.plotTheme);
  return {
    lineWidth: theme.lineWidth,
    markerSize: theme.markerSize,
    markerOpacity: theme.markerOpacity,
  };
}
