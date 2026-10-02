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
export const Copy = (p) => (
  <svg {...base} {...p}><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" /></svg>
);
export const Check = (p) => (
  <svg {...base} {...p}><path d="M3 8.5l3.2 3.2L13 4.8" /></svg>
);
export const Lock = (p) => (
  <svg {...base} {...p}><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" /></svg>
);
