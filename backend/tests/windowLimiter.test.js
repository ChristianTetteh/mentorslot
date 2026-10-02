const { createWindowLimiter } = require("../lib/windowLimiter");

describe("createWindowLimiter", () => {
  it("allows `max` per window per key, then blocks until the window passes", () => {
    let t = 1000;
    const l = createWindowLimiter({ max: 2, windowMs: 100, now: () => t });
    expect([l.take("a"), l.take("a"), l.take("a"), l.take("b")]).toEqual([true, true, false, true]);
    t += 99;
    expect(l.take("a")).toBe(false);
    t += 1;
    expect(l.take("a")).toBe(true);
  });

  it("stays bounded under a flood of distinct keys", () => {
    const l = createWindowLimiter({ max: 1, windowMs: 1e9, maxKeys: 100 });
    for (let i = 0; i < 1000; i++) l.take(`k${i}`);
    // still functional, and recent keys are still tracked
    expect(l.take("k999")).toBe(false);
    expect(l.take("brand-new")).toBe(true);
  });
});
