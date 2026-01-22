// workspace/sdk/policy.ts
// Centralized, deterministic rules and helpers used by sandbox jobs.
// Keep these rules out of prompts so behavior stays consistent across runs.
//
// Notes:
// - Timezone: America/Sao_Paulo
// - Avoid secrets or environment access here.
// - Prefer pure functions (no network IO).

import { DateTime } from "npm:luxon";

export const POLICY_VERSION = "1.0.0";

// Timezone
export const TZ_NAME = "America/Sao_Paulo";

// Business hours (local time)
export const BUSINESS_DAYS = new Set([1, 2, 3, 4, 5]); // Luxon: Mon=1 .. Sun=7
export const BUSINESS_START_HOUR = 9;
export const BUSINESS_END_HOUR = 18;

// Message / automation guardrails
export const MAX_TEAMS_MESSAGES_PER_PERSON_PER_DAY = 1;
export const DEFAULT_DEDUPE_COOLDOWN_MINUTES = 24 * 60;
export const MAX_VIKUNJA_TASKS_CREATED_PER_RUN_DEFAULT = 3;

// Time tracking hygiene defaults (tune as needed)
export const MIN_DAILY_HOURS_DEFAULT = 6;
export const MIDDAY_CHECK_HOUR_DEFAULT = 15; // 15:00 local
export const FINAL_CHECK_HOUR_DEFAULT = 17;  // 17:00 local

// Meeting prep ignore rules (project preferences)
export const IGNORE_CALENDAR_EVENT_IDS = new Set<string>([
  "AAMkADNmMjBkMmQ3LWFlYWMtNGZkNS05Zjk4LWJlZTQ2NjRlMjU4OQFRAAgI3lL-3FbAAEYAAAAAMhM-QvFPwk2e4iH3TWmqXwcAk3yXyo3knEucuEZfffU2jwAAAAABDQAAk3yXyo3knEucuEZfffU2jwAAZCXKTwAAEA==",
]);

export const IGNORE_CALENDAR_TITLES = new Set<string>([
  "OOO - Leandro Menezes",
]);

// Blocker follow-up concierge escalation thresholds (hours)
export const BLOCKER_ESCALATE_AFTER_HOURS_HIGH = 24;
export const BLOCKER_ESCALATE_AFTER_HOURS_NORMAL = 48;

// ---------- Time helpers ----------

export function nowLocal(): DateTime {
  return DateTime.now().setZone(TZ_NAME);
}

export function parseIsoToLocal(iso: string): DateTime {
  // Accepts ISO with or without zone. If no zone, assume TZ_NAME.
  const withZone = DateTime.fromISO(iso, { setZone: true });
  if (withZone.isValid && withZone.zoneName !== "local") return withZone.setZone(TZ_NAME);

  const assumed = DateTime.fromISO(iso, { zone: TZ_NAME });
  if (!assumed.isValid) {
    throw new Error(`Invalid ISO datetime: ${iso}`);
  }
  return assumed.setZone(TZ_NAME);
}

export function isBusinessDay(dt: DateTime): boolean {
  const local = dt.setZone(TZ_NAME);
  return BUSINESS_DAYS.has(local.weekday);
}

export function isBusinessHours(dt: DateTime): boolean {
  const local = dt.setZone(TZ_NAME);
  if (!BUSINESS_DAYS.has(local.weekday)) return false;
  const hourFloat = local.hour + local.minute / 60;
  return hourFloat >= BUSINESS_START_HOUR && hourFloat < BUSINESS_END_HOUR;
}

export function clampToNextBusinessTime(dt: DateTime, minuteGranularity = 5): DateTime {
  // If outside business time, return the next business day at start time.
  // If inside business time, round up to next minuteGranularity boundary.
  let local = dt.setZone(TZ_NAME).set({ second: 0, millisecond: 0 });

  // Move forward to a business day if needed
  while (!BUSINESS_DAYS.has(local.weekday)) {
    local = local.plus({ days: 1 }).startOf("day");
  }

  // If after hours, move to next business day start
  if (local.hour >= BUSINESS_END_HOUR) {
    local = local.plus({ days: 1 }).startOf("day");
    while (!BUSINESS_DAYS.has(local.weekday)) {
      local = local.plus({ days: 1 }).startOf("day");
    }
    return local.set({ hour: BUSINESS_START_HOUR, minute: 0, second: 0, millisecond: 0 });
  }

  // If before hours, clamp to start
  if (local.hour < BUSINESS_START_HOUR) {
    return local.set({ hour: BUSINESS_START_HOUR, minute: 0, second: 0, millisecond: 0 });
  }

  // Round up minute to granularity
  const roundedMinute = Math.ceil(local.minute / minuteGranularity) * minuteGranularity;
  if (roundedMinute >= 60) {
    local = local.plus({ hours: 1 }).set({ minute: 0 });
  } else {
    local = local.set({ minute: roundedMinute });
  }

  // If rounding pushed past end, move to next business start
  if (local.hour >= BUSINESS_END_HOUR) {
    return clampToNextBusinessTime(local.plus({ days: 1 }).startOf("day"), minuteGranularity);
  }

  return local;
}

export function addBusinessHours(dt: DateTime, hoursToAdd: number): DateTime {
  // Adds hours while skipping non-business hours. Useful for escalation thresholds.
  if (hoursToAdd <= 0) return dt;

  let remainingMinutes = Math.round(hoursToAdd * 60);
  let cur = clampToNextBusinessTime(dt);

  while (remainingMinutes > 0) {
    cur = clampToNextBusinessTime(cur);

    const endOfBusiness = cur
      .setZone(TZ_NAME)
      .set({ hour: BUSINESS_END_HOUR, minute: 0, second: 0, millisecond: 0 });

    const minutesLeftToday = Math.max(0, Math.floor(endOfBusiness.diff(cur, "minutes").minutes));
    if (minutesLeftToday <= 0) {
      cur = clampToNextBusinessTime(cur.plus({ days: 1 }).startOf("day"));
      continue;
    }

    const step = Math.min(remainingMinutes, minutesLeftToday);
    cur = cur.plus({ minutes: step });
    remainingMinutes -= step;
  }

  return cur;
}

export function makeIso(dt: DateTime): string {
  return dt.setZone(TZ_NAME).toISO({ suppressMilliseconds: true }) ?? dt.toISO() ?? "";
}

// ---------- Calendar ignore rules ----------

export function shouldIgnoreCalendarEvent(eventId?: string | null, title?: string | null): boolean {
  if (eventId && IGNORE_CALENDAR_EVENT_IDS.has(eventId)) return true;
  if (title && IGNORE_CALENDAR_TITLES.has(title.trim())) return true;
  return false;
}

// ---------- Dedupe helpers ----------

export function normalizeDedupeKey(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildDedupeKey(parts: Array<string | number | undefined | null>): string {
  return normalizeDedupeKey(parts.filter((p) => p !== undefined && p !== null).join(":"));
}

// ---------- Concierge / escalation logic ----------

export function computeBlockerEscalationHours(priority: string | undefined | null): number {
  const p = (priority || "").trim().toLowerCase();
  if (["p0", "critical", "high", "urgent"].includes(p)) return BLOCKER_ESCALATE_AFTER_HOURS_HIGH;
  return BLOCKER_ESCALATE_AFTER_HOURS_NORMAL;
}

export function allowPingPersonToday(pingsSentToday: number): boolean {
  return pingsSentToday < MAX_TEAMS_MESSAGES_PER_PERSON_PER_DAY;
}

// ---------- Time hygiene helpers ----------

export type TimeHygienePolicy = {
  minDailyHours: number;
  middayCheckHour: number;
  finalCheckHour: number;
};

export function defaultTimeHygienePolicy(): TimeHygienePolicy {
  return {
    minDailyHours: MIN_DAILY_HOURS_DEFAULT,
    middayCheckHour: MIDDAY_CHECK_HOUR_DEFAULT,
    finalCheckHour: FINAL_CHECK_HOUR_DEFAULT,
  };
}

export function shouldRunMiddayCheck(now: DateTime, policy: TimeHygienePolicy = defaultTimeHygienePolicy()): boolean {
  const local = now.setZone(TZ_NAME);
  if (!isBusinessDay(local)) return false;
  return local.hour === policy.middayCheckHour;
}

export function shouldRunFinalCheck(now: DateTime, policy: TimeHygienePolicy = defaultTimeHygienePolicy()): boolean {
  const local = now.setZone(TZ_NAME);
  if (!isBusinessDay(local)) return false;
  return local.hour === policy.finalCheckHour;
}
