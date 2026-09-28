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
