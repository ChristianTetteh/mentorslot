const { useFixedClock, isoAt, FIXED_NOW } = require("./helpers/clock");
const {
  BUFFER_MINUTES,
  MAX_DAYS_AHEAD,
  businessDays,
  gridStartsForDay,
  offeredWindow,
  candidateSlots,
  isOfferedStart,
} = require("../lib/schedule");

useFixedClock();

const hhmm = (d) => d.toISOString().slice(11, 16);
const gridFor = (duration) => [...gridStartsForDay(new Date("2030-03-05T00:00:00Z"), duration)].map(({ start }) => hhmm(start));

describe("gridStartsForDay", () => {
  it("spaces 30-minute sessions 45 minutes apart in each business block", () => {
    expect(gridFor(30)).toEqual(["09:00", "09:45", "10:30", "11:15", "13:00", "13:45", "14:30", "15:15", "16:00"]);
  });

  it("spaces 45-minute sessions 60 minutes apart", () => {
    expect(gridFor(45)).toEqual(["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"]);
  });

  it("spaces 60-minute sessions 75 minutes apart and never runs past a block edge", () => {
    expect(gridFor(60)).toEqual(["09:00", "10:15", "13:00", "14:15", "15:30"]);
  });

  it("keeps every candidate inside its block and leaves exactly the buffer between neighbours", () => {
    for (const duration of [30, 45, 60]) {
      const slots = [...gridStartsForDay(new Date("2030-03-05T00:00:00Z"), duration)];
      slots.forEach(({ start, boundary }, i) => {
        expect(start.getTime() + duration * 60000).toBeLessThanOrEqual(boundary.getTime());
        const next = slots[i + 1];
        if (next && next.boundary.getTime() === boundary.getTime()) {
          expect(next.start.getTime() - (start.getTime() + duration * 60000)).toBe(BUFFER_MINUTES * 60000);
        }
      });
    }
  });
});

describe("businessDays", () => {
  it("starts tomorrow and skips weekends", () => {
    // FIXED_NOW is Monday 4 March 2030; the next 7 calendar days include Sat 9th and Sun 10th.
    const days = businessDays(FIXED_NOW, 7).map((d) => d.toISOString().slice(0, 10));
    expect(days).toEqual(["2030-03-05", "2030-03-06", "2030-03-07", "2030-03-08", "2030-03-11"]);
  });
});

describe("offeredWindow / candidateSlots / isOfferedStart", () => {
  it("covers from the start of tomorrow to the end of day MAX_DAYS_AHEAD", () => {
    const { earliest, latest } = offeredWindow(FIXED_NOW);
    expect(earliest.toISOString()).toBe("2030-03-05T00:00:00.000Z");
    expect(latest.toISOString()).toBe("2030-04-04T00:00:00.000Z");
    expect(MAX_DAYS_AHEAD).toBe(30);
  });

  it("agrees with the candidate list for every duration", () => {
    for (const duration of [30, 45, 60]) {
      for (const { start } of candidateSlots(FIXED_NOW, MAX_DAYS_AHEAD, duration)) {
        expect(isOfferedStart(start, duration, FIXED_NOW)).toBe(true);
      }
    }
  });

  it.each([
    ["a time on the grid", 1, 9, 0, 30, true],
    ["the last grid time of the horizon", 30, 16, 0, 30, true],
    ["a minute off the grid", 1, 9, 1, 30, false],
    ["a half-hour slot that isn't on the 30-minute grid", 1, 9, 30, 30, false],
    ["a time on the 30 grid but not the 45 grid", 1, 9, 45, 45, false],
    ["before opening", 1, 8, 0, 30, false],
    ["during lunch", 1, 12, 0, 30, false],
    ["a session that would run past 17:00", 1, 16, 45, 30, false],
    ["a Saturday", 5, 9, 0, 30, false],
    ["later today", 0, 15, 0, 30, false],
    ["a day past the horizon", 31, 9, 0, 30, false],
  ])("%s", (_label, day, h, m, duration, expected) => {
    expect(isOfferedStart(new Date(isoAt(day, h, m)), duration, FIXED_NOW)).toBe(expected);
  });
});
