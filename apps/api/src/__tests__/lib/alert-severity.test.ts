import { describe, test, expect } from "bun:test";
import { computeDeviationSeverity } from "../../lib/alert-severity";

describe("computeDeviationSeverity", () => {
  test("falls back to high when the limit is missing or zero", () => {
    expect(computeDeviationSeverity(12, null)).toBe("high");
    expect(computeDeviationSeverity(12, undefined)).toBe("high");
    expect(computeDeviationSeverity(12, 0)).toBe("high");
  });

  test("returns low below 10% deviation", () => {
    expect(computeDeviationSeverity(31, 30)).toBe("low");
    expect(computeDeviationSeverity(2.567, 2.5)).toBe("low");
  });

  test("returns medium between 10% and 25% deviation", () => {
    expect(computeDeviationSeverity(33, 30)).toBe("medium");
    expect(computeDeviationSeverity(27, 30)).toBe("medium");
  });

  test("returns high between 25% and 50% deviation", () => {
    expect(computeDeviationSeverity(40, 30)).toBe("high");
    expect(computeDeviationSeverity(20, 30)).toBe("high");
  });

  test("returns critical at 50% deviation or more", () => {
    expect(computeDeviationSeverity(45, 30)).toBe("critical");
    expect(computeDeviationSeverity(2, 10)).toBe("critical");
  });

  test("uses the absolute limit so negative limits work symmetrically", () => {
    expect(computeDeviationSeverity(-35, -30)).toBe("medium");
  });
});
