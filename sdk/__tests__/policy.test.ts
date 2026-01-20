import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  TZ_NAME,
  addBusinessHours,
  buildDedupeKey,
  clampToNextBusinessTime,
  computeBlockerEscalationHours,
  isBusinessDay,
  isBusinessHours,
  normalizeDedupeKey,
  parseIsoToLocal,
  shouldIgnoreCalendarEvent,
} from "../policy";

describe("policy helpers", () => {
  it("normalizes and builds dedupe keys", () => {
    expect(normalizeDedupeKey("  Hello   WORLD ")).toBe("hello world");
    expect(buildDedupeKey(["A", 1, undefined, "B"])).toBe("a:1:b");
  });

  it("parses ISO and clamps timezone to policy TZ", () => {
    const dt = parseIsoToLocal("2026-01-20T10:00:00");
    expect(dt.zoneName).toBe(TZ_NAME);
    expect(dt.toISO()).toContain("2026-01-20T10:00:00");
  });

  it("business day / hours checks", () => {
    const mon10 = DateTime.fromISO("2026-01-19T10:00:00", { zone: TZ_NAME }); // Monday
    const sun10 = DateTime.fromISO("2026-01-18T10:00:00", { zone: TZ_NAME }); // Sunday
    expect(isBusinessDay(mon10)).toBe(true);
    expect(isBusinessDay(sun10)).toBe(false);
    expect(isBusinessHours(mon10)).toBe(true);
    expect(isBusinessHours(mon10.set({ hour: 20 }))).toBe(false);
  });

  it("clamps to next business time and adds business hours", () => {
    const sun = DateTime.fromISO("2026-01-18T08:02:00", { zone: TZ_NAME }); // Sunday
    const clamped = clampToNextBusinessTime(sun, 5);
    expect(isBusinessDay(clamped)).toBe(true);
    expect(isBusinessHours(clamped)).toBe(true);
    expect(clamped.minute % 5).toBe(0);

    const added = addBusinessHours(clamped, 2);
    expect(added.toMillis()).toBeGreaterThan(clamped.toMillis());
  });

  it("ignores known calendar events", () => {
    expect(shouldIgnoreCalendarEvent(undefined, "OOO - Leandro Menezes")).toBe(true);
  });

  it("computes escalation hours from priority", () => {
    expect(computeBlockerEscalationHours("P0")).toBe(24);
    expect(computeBlockerEscalationHours("normal")).toBe(48);
  });
});

