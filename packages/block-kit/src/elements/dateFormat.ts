/** "1st", "2nd", "3rd", "11th"… as Slack writes the day in a long date ("January 1st, 2026"). */
export function ordinal(day: number): string {
  if (day % 10 === 1 && day !== 11) return `${day}st`;
  if (day % 10 === 2 && day !== 12) return `${day}nd`;
  if (day % 10 === 3 && day !== 13) return `${day}rd`;
  return `${day}th`;
}

/** Slack names time zones by their Windows display name (minus the UTC offset), not the IANA id. */
const TIME_ZONE_LABELS: Record<string, string> = {
  "Europe/Amsterdam": "Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna",
  "Europe/Berlin": "Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna",
  "Europe/Zurich": "Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna",
  "Europe/Rome": "Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna",
  "Europe/Stockholm": "Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna",
  "Europe/Vienna": "Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna",
  "Europe/Brussels": "Brussels, Copenhagen, Madrid, Paris",
  "Europe/Copenhagen": "Brussels, Copenhagen, Madrid, Paris",
  "Europe/Madrid": "Brussels, Copenhagen, Madrid, Paris",
  "Europe/Paris": "Brussels, Copenhagen, Madrid, Paris",
  "Europe/Belgrade": "Belgrade, Bratislava, Budapest, Ljubljana, Prague",
  "Europe/Budapest": "Belgrade, Bratislava, Budapest, Ljubljana, Prague",
  "Europe/Prague": "Belgrade, Bratislava, Budapest, Ljubljana, Prague",
  "Europe/Warsaw": "Sarajevo, Skopje, Warsaw, Zagreb",
  "Europe/Dublin": "Dublin, Edinburgh, Lisbon, London",
  "Europe/Lisbon": "Dublin, Edinburgh, Lisbon, London",
  "Europe/London": "Dublin, Edinburgh, Lisbon, London",
  "Europe/Athens": "Athens, Bucharest",
  "Europe/Bucharest": "Athens, Bucharest",
  "Europe/Helsinki": "Helsinki, Kyiv, Riga, Sofia, Tallinn, Vilnius",
  "Europe/Kyiv": "Helsinki, Kyiv, Riga, Sofia, Tallinn, Vilnius",
  "Europe/Istanbul": "Istanbul",
  "Europe/Moscow": "Moscow, St. Petersburg",
  "America/New_York": "Eastern Time (US and Canada)",
  "America/Chicago": "Central Time (US and Canada)",
  "America/Denver": "Mountain Time (US and Canada)",
  "America/Phoenix": "Arizona",
  "America/Los_Angeles": "Pacific Time (US and Canada)",
  "America/Anchorage": "Alaska",
  "Pacific/Honolulu": "Hawaii",
  "America/Halifax": "Atlantic Time (Canada)",
  "America/Sao_Paulo": "Brasilia",
  "Asia/Dubai": "Abu Dhabi, Muscat",
  "Asia/Kolkata": "Chennai, Kolkata, Mumbai, New Delhi",
  "Asia/Shanghai": "Beijing, Chongqing, Hong Kong, Urumqi",
  "Asia/Hong_Kong": "Beijing, Chongqing, Hong Kong, Urumqi",
  "Asia/Singapore": "Kuala Lumpur, Singapore",
  "Asia/Tokyo": "Osaka, Sapporo, Tokyo",
  "Australia/Sydney": "Canberra, Melbourne, Sydney",
  "Australia/Melbourne": "Canberra, Melbourne, Sydney",
  "Pacific/Auckland": "Auckland, Wellington",
};

/** The label Slack shows under a datetimepicker; unknown zones fall back to their IANA id. */
export function timeZoneLabel(timeZone: string): string {
  return TIME_ZONE_LABELS[timeZone] ?? timeZone;
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
