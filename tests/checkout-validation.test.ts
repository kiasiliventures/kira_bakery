import { describe, expect, it, vi } from "vitest";
import {
  clampCheckoutDateToSelectableMinimum,
  getCheckoutEarliestDeliveryDateValue,
  getCheckoutMinimumSelectableDateValue,
} from "@/lib/validation";

describe("checkout date selection helpers", () => {
  it("uses today as the minimum selectable pickup date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T08:00:00.000Z"));

    expect(getCheckoutMinimumSelectableDateValue("pickup")).toBe("2026-04-13");

    vi.useRealTimers();
  });

  it("uses the earliest delivery date as the minimum selectable delivery date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T16:30:00.000Z"));

    expect(getCheckoutEarliestDeliveryDateValue()).toBe("2026-04-13");
    expect(getCheckoutMinimumSelectableDateValue("delivery")).toBe("2026-04-13");

    vi.useRealTimers();
  });

  it("clamps past mobile-selected dates up to the selectable minimum", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T08:00:00.000Z"));

    expect(clampCheckoutDateToSelectableMinimum("2026-04-12", "pickup")).toBe("2026-04-13");
    expect(clampCheckoutDateToSelectableMinimum("2026-04-12", "delivery")).toBe("2026-04-13");

    vi.useRealTimers();
  });
});
