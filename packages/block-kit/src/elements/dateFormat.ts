import { slackTimeZoneName } from "./timeZoneNames";

/** "1st", "2nd", "3rd", "11th"… as Slack writes the day in a long date ("January 1st, 2026"). */
export function ordinal(day: number): string {
  if (day % 10 === 1 && day !== 11) return `${day}st`;
  if (day % 10 === 2 && day !== 12) return `${day}nd`;
  if (day % 10 === 3 && day !== 13) return `${day}rd`;
  return `${day}th`;
}

/**
 * The name Slack shows for a time zone ("Eastern Time (US and Canada)"), from the names measured
 * in Block Kit Builder. An alias the Builder wasn't asked about is looked up by its canonical id;
 * a zone it doesn't name falls back to the IANA id.
 */
export function timeZoneLabel(timeZone: string): string {
  const direct = slackTimeZoneName(timeZone);
  if (direct) return direct;
  try {
    const canonical = new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
    return slackTimeZoneName(canonical) ?? timeZone;
  } catch {
    return timeZone;
  }
}

/** A timestamp's wall-clock date ("2026-01-01") and time ("11:00") in `timeZone`. */
export function wallClock(ts: number, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ts * 1000));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** The timestamp of a wall-clock date and time in `timeZone`. Around a daylight saving change it
 * resolves like JavaScript's `Date`: a time the clocks skip moves forward by the gap, and a time
 * they repeat takes its first occurrence. */
export function fromWallClock(date: string, time: string, timeZone: string): number {
  const asUtc = Date.parse(`${date}T${time}:00Z`) / 1000;
  const offsetAt = (ts: number) => {
    const wall = wallClock(ts, timeZone);
    return Date.parse(`${wall.date}T${wall.time}:00Z`) / 1000 - ts;
  };
  // A zone has at most two offsets within a day of any instant: the one before a change and the
  // one after it.
  const before = asUtc - offsetAt(asUtc - 86400);
  const after = asUtc - offsetAt(asUtc + 86400);
  const matches = [before, after].filter((ts) => {
    const wall = wallClock(ts, timeZone);
    return wall.date === date && wall.time === time;
  });
  return matches.length > 0 ? Math.min(...matches) : before;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** `YYYY-MM-DD` for a real calendar date, or undefined (e.g. April 31st). */
function isoDate(year: number, month: number, day: number): string | undefined {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return undefined;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** A two-digit year as Slack reads it: 69–99 in the 1900s, 00–68 in the 2000s. */
function fullYear(year: string): number {
  const n = Number(year);
  if (year.length > 2) return n;
  return n >= 69 ? 1900 + n : 2000 + n;
}

/**
 * Reads a date typed into a datepicker field, as Slack's does: "05/01/1990", "5/4/90",
 * "1990-05-02", "May 3, 1990" or the field's own long form, "April 28th, 1990". Returns
 * `YYYY-MM-DD`, or undefined for anything else.
 */
export function parseTypedDate(input: string): string | undefined {
  const text = input.trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
  if (m) return isoDate(fullYear(m[3]!), Number(m[1]), Number(m[2]));
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(text);
  if (m) {
    const name = m[1]!.toLowerCase();
    const index = MONTHS.findIndex(
      (month) => month === name || (name.length >= 3 && month.startsWith(name)),
    );
    if (index >= 0) return isoDate(Number(m[3]), index + 1, Number(m[2]));
  }
  return undefined;
}
