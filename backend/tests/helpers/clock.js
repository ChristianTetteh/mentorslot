// A fixed fake "now" so no test depends on the real date. Only Date is faked
// (supertest and the rate limiter need the real timers/event loop).
//
// FIXED_NOW is a Monday, so "tomorrow" (day offset 1) is a bookable Tuesday.
const FIXED_NOW = new Date("2030-03-04T10:00:00.000Z");

const REAL_TIMER_APIS = [
  "hrtime", "nextTick", "performance", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame",
  "requestIdleCallback", "cancelIdleCallback", "setImmediate", "clearImmediate", "setInterval", "clearInterval",
  "setTimeout", "clearTimeout",
];

function useFixedClock(now = FIXED_NOW) {
  beforeEach(() => jest.useFakeTimers({ now, doNotFake: REAL_TIMER_APIS }));
  afterEach(() => jest.useRealTimers());
}

// ISO string for HH:MM UTC on the day `dayOffset` days after FIXED_NOW's date.
function isoAt(dayOffset, hour, minute = 0) {
  const d = new Date(FIXED_NOW);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

module.exports = { FIXED_NOW, useFixedClock, isoAt };
