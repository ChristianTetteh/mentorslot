const { validateBookingInput } = require("../lib/validation");

describe("validateBookingInput", () => {
  it("accepts valid input and normalizes it", () => {
    const result = validateBookingInput({ slot_id: "42", name: "  Ama Boateng  ", email: "  Ama@Example.COM " });
    expect(result).toEqual({ slotId: 42, name: "Ama Boateng", email: "ama@example.com" });
  });

  it("rejects a missing/invalid slot id", () => {
    expect(validateBookingInput({ slot_id: "abc", name: "Ama", email: "a@b.com" }).error).toBeTruthy();
    expect(validateBookingInput({ slot_id: 0, name: "Ama", email: "a@b.com" }).error).toBeTruthy();
    expect(validateBookingInput({ slot_id: -3, name: "Ama", email: "a@b.com" }).error).toBeTruthy();
    expect(validateBookingInput({ name: "Ama", email: "a@b.com" }).error).toBeTruthy();
  });

  it("rejects a name that's too short, too long, or missing", () => {
    expect(validateBookingInput({ slot_id: 1, name: "A", email: "a@b.com" }).error).toBeTruthy();
    expect(validateBookingInput({ slot_id: 1, name: "x".repeat(101), email: "a@b.com" }).error).toBeTruthy();
    expect(validateBookingInput({ slot_id: 1, email: "a@b.com" }).error).toBeTruthy();
  });

  it("rejects an invalid or missing email", () => {
    expect(validateBookingInput({ slot_id: 1, name: "Ama", email: "not-an-email" }).error).toBeTruthy();
    expect(validateBookingInput({ slot_id: 1, name: "Ama", email: "" }).error).toBeTruthy();
    expect(validateBookingInput({ slot_id: 1, name: "Ama" }).error).toBeTruthy();
  });
});
