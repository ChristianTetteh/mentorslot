const { validateBookingInput } = require("../lib/validation");

const { useFixedClock, isoAt } = require("./helpers/clock");

useFixedClock();

// Tomorrow 09:00 UTC (on every duration's grid) and yesterday.
const future = () => isoAt(1, 9, 0);
const past = () => isoAt(-1, 9, 0);
const base = (over = {}) => ({ mentor_id: 1, start_time: future(), duration: 30, name: "Ama", email: "a@b.com", ...over });

describe("validateBookingInput", () => {
  it("accepts valid input and normalizes it", () => {
    const start = future();
    const result = validateBookingInput({
      mentor_id: "42",
      start_time: start,
      duration: "45",
      name: "  Ama Boateng  ",
      email: "  Ama@Example.COM ",
    });
    expect(result.error).toBeUndefined();
    expect(result.mentorId).toBe(42);
    expect(result.durationMinutes).toBe(45);
    expect(result.name).toBe("Ama Boateng");
    expect(result.email).toBe("ama@example.com");
    expect(result.start.toISOString()).toBe(new Date(start).toISOString());
    expect(result.end.getTime() - result.start.getTime()).toBe(45 * 60 * 1000);
  });

  it("rejects a missing/invalid mentor id", () => {
    expect(validateBookingInput({ mentor_id: "abc", start_time: future(), duration: 30, name: "Ama", email: "a@b.com" }).error).toBeTruthy();
    expect(validateBookingInput({ mentor_id: 0, start_time: future(), duration: 30, name: "Ama", email: "a@b.com" }).error).toBeTruthy();
    expect(validateBookingInput({ mentor_id: -3, start_time: future(), duration: 30, name: "Ama", email: "a@b.com" }).error).toBeTruthy();
    expect(validateBookingInput({ start_time: future(), duration: 30, name: "Ama", email: "a@b.com" }).error).toBeTruthy();
  });

  it("rejects a missing/invalid start time, including times in the past", () => {
    expect(validateBookingInput({ mentor_id: 1, duration: 30, name: "Ama", email: "a@b.com" }).error).toBeTruthy();
    expect(validateBookingInput({ mentor_id: 1, start_time: "not-a-date", duration: 30, name: "Ama", email: "a@b.com" }).error).toBeTruthy();
    expect(validateBookingInput({ mentor_id: 1, start_time: past(), duration: 30, name: "Ama", email: "a@b.com" }).error).toBeTruthy();
  });

  it("rejects a duration outside the allowed set", () => {
    expect(validateBookingInput({ mentor_id: 1, start_time: future(), duration: 20, name: "Ama", email: "a@b.com" }).error).toBeTruthy();
    expect(validateBookingInput({ mentor_id: 1, start_time: future(), duration: "ninety", name: "Ama", email: "a@b.com" }).error).toBeTruthy();
    expect(validateBookingInput({ mentor_id: 1, start_time: future(), name: "Ama", email: "a@b.com" }).error).toBeTruthy();
  });

  it("accepts each of the three allowed durations", () => {
    for (const duration of [30, 45, 60]) {
      const result = validateBookingInput({ mentor_id: 1, start_time: future(), duration, name: "Ama", email: "a@b.com" });
      expect(result.error).toBeUndefined();
      expect(result.durationMinutes).toBe(duration);
    }
  });

  it("rejects a name that's too short, too long, or missing", () => {
    expect(validateBookingInput({ mentor_id: 1, start_time: future(), duration: 30, name: "A", email: "a@b.com" }).error).toBeTruthy();
    expect(validateBookingInput({ mentor_id: 1, start_time: future(), duration: 30, name: "x".repeat(101), email: "a@b.com" }).error).toBeTruthy();
    expect(validateBookingInput({ mentor_id: 1, start_time: future(), duration: 30, email: "a@b.com" }).error).toBeTruthy();
  });

  it("rejects an invalid or missing email", () => {
    expect(validateBookingInput({ mentor_id: 1, start_time: future(), duration: 30, name: "Ama", email: "not-an-email" }).error).toBeTruthy();
    expect(validateBookingInput({ mentor_id: 1, start_time: future(), duration: 30, name: "Ama", email: "" }).error).toBeTruthy();
    expect(validateBookingInput({ mentor_id: 1, start_time: future(), duration: 30, name: "Ama" }).error).toBeTruthy();
  });

  it("rejects start times with no timezone offset, or in other formats", () => {
    for (const start_time of ["2030-03-05T09:00:00", "2030-03-05", "2030-03-05 09:00:00Z", "March 5 2030 09:00 UTC", 1898760000000]) {
      expect(validateBookingInput(base({ start_time })).error).toBeTruthy();
    }
  });

  it("accepts an explicit non-UTC offset when it lands on the grid", () => {
    const result = validateBookingInput(base({ start_time: "2030-03-05T10:00:00+01:00" }));
    expect(result.error).toBeUndefined();
    expect(result.start.toISOString()).toBe(isoAt(1, 9, 0));
  });

  it("rejects start times that aren't on the offered grid for that duration", () => {
    expect(validateBookingInput(base({ start_time: isoAt(1, 9, 30) })).error).toMatch(/isn't available/);
    expect(validateBookingInput(base({ start_time: isoAt(1, 9, 1) })).error).toMatch(/isn't available/);
    expect(validateBookingInput(base({ start_time: isoAt(1, 9, 45), duration: 45 })).error).toMatch(/isn't available/);
    expect(validateBookingInput(base({ start_time: isoAt(1, 9, 45), duration: 30 })).error).toBeUndefined();
  });

  it("rejects weekends and times outside business hours", () => {
    expect(validateBookingInput(base({ start_time: isoAt(5, 9, 0) })).error).toMatch(/isn't available/); // Saturday
    expect(validateBookingInput(base({ start_time: isoAt(1, 8, 0) })).error).toMatch(/isn't available/);
    expect(validateBookingInput(base({ start_time: isoAt(1, 12, 0) })).error).toMatch(/isn't available/);
    expect(validateBookingInput(base({ start_time: isoAt(1, 16, 45) })).error).toMatch(/isn't available/);
  });

  it("rejects times earlier than tomorrow, like the slots endpoint", () => {
    expect(validateBookingInput(base({ start_time: isoAt(0, 15, 0) })).error).toMatch(/from tomorrow/);
  });

  it("rejects times beyond the 30-day horizon but accepts the last offered day", () => {
    expect(validateBookingInput(base({ start_time: isoAt(31, 9, 0) })).error).toMatch(/30 days/);
    expect(validateBookingInput(base({ start_time: isoAt(30, 9, 0) })).error).toBeUndefined();
    expect(validateBookingInput(base({ start_time: "9999-12-31T09:00:00Z" })).error).toMatch(/30 days/);
  });
});
