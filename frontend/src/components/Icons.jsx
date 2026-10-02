// Small inline icons. All decorative: callers keep their own text labels.
const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", focusable: "false" };

export const ChevronRight = (p) => (
  <svg {...base} {...p}><path d="M6 3l5 5-5 5" /></svg>
);
export const ChevronLeft = (p) => (
  <svg {...base} {...p}><path d="M10 3L5 8l5 5" /></svg>
);
export const Clock = (p) => (
  <svg {...base} {...p}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.2 1.4" /></svg>
);
export const Globe = (p) => (
  <svg {...base} {...p}><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 1.8 2.8 3.8 2.8 6S10 12.2 8 14c-2-1.8-2.8-3.8-2.8-6S6 3.8 8 2z" /></svg>
);
export const Close = (p) => (
  <svg {...base} {...p}><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
);
export const Alert = (p) => (
  <svg {...base} {...p}><circle cx="8" cy="8" r="6" /><path d="M8 4.8v3.6M8 11h.01" /></svg>
);
