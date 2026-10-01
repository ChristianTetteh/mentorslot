const { validateBookingInput } = require("../lib/validation");

const future = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

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
});
