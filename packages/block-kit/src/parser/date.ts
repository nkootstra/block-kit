export interface FormatDateOptions {
  /** BCP 47 locale. Slack formats dates in the viewer's locale. Defaults to `en-US`. */
  locale?: string;
  /** IANA time zone. Defaults to the runtime's zone. */
  timeZone?: string;
  /** Reference time for `{ago}` and the `_pretty` variants. Defaults to `Date.now()`. */
  now?: number;
}

const TOKEN_RE =
  /\{(date_num|date_slash|date_long_full|date_long_pretty|date_long|date_pretty|date_short_pretty|date_short|date|time_secs|time|ago)\}/g;

/**
 * Formats a `<!date^...>` token string the way Slack does, e.g.
 * `formatSlackDate(1392734382, "{date_short} at {time}")` → `Feb 18, 2014 at 6:39 AM`.
 * Unknown `{tokens}` are left as they are.
 */
export function formatSlackDate(
  timestamp: number,
  format: string,
  options: FormatDateOptions = {},
): string {
  const locale = options.locale ?? "en-US";
  const timeZone = options.timeZone;
  const date = new Date(timestamp * 1000);
  const now = options.now ?? Date.now();

  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone, ...opts }).format(date);
  const parts = (opts: Intl.DateTimeFormatOptions) =>
    Object.fromEntries(
      new Intl.DateTimeFormat(locale, { timeZone, ...opts })
        .formatToParts(date)
        .map((p) => [p.type, p.value]),
    ) as Record<string, string>;

  const ordinalDay = () => {
    const day = Number(parts({ day: "numeric" }).day);
    return locale.startsWith("en") ? `${day}${ordinalSuffix(day)}` : String(day);
  };
  const monthName = (month: "long" | "short") => parts({ month }).month ?? "";
  const year = () => parts({ year: "numeric" }).year ?? "";
  const relativeDay = () => relativeDayName(date, now, locale, timeZone);

  const date_ = () => `${monthName("long")} ${ordinalDay()}, ${year()}`;
  const dateShort = () => fmt({ month: "short", day: "numeric", year: "numeric" });
  const dateLong = () => `${parts({ weekday: "long" }).weekday}, ${date_()}`;

  const tokens: Record<string, () => string> = {
    date_num: () => {
      const p = parts({ year: "numeric", month: "2-digit", day: "2-digit" });
      return `${p.year}-${p.month}-${p.day}`;
    },
    date_slash: () => fmt({ year: "numeric", month: "2-digit", day: "2-digit" }),
    date: date_,
    date_pretty: () => relativeDay() ?? date_(),
    date_short: dateShort,
    date_short_pretty: () => relativeDay() ?? dateShort(),
    date_long: dateLong,
    date_long_full: dateLong,
    date_long_pretty: () => relativeDay() ?? dateLong(),
    time: () => fmt({ hour: "numeric", minute: "2-digit" }),
    time_secs: () => fmt({ hour: "numeric", minute: "2-digit", second: "2-digit" }),
    ago: () => ago(date.getTime(), now, locale),
  };

  return format.replace(TOKEN_RE, (_, token: string) => tokens[token]?.() ?? `{${token}}`);
}

function ordinalSuffix(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][day % 10] ?? "th";
}

function relativeDayName(
  date: Date,
  now: number,
  locale: string,
  timeZone: string | undefined,
): string | null {
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const target = Date.parse(dayKey(date));
  const today = Date.parse(dayKey(new Date(now)));
  const diff = Math.round((target - today) / 86_400_000);
  if (diff < -1 || diff > 1) return null;
  const text = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(diff, "day");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ago(time: number, now: number, locale: string): string {
  const seconds = Math.round((time - now) / 1000);
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  if (abs < 60) return rtf.format(seconds, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 2_592_000) return rtf.format(Math.round(seconds / 86_400), "day");
  if (abs < 31_536_000) return rtf.format(Math.round(seconds / 2_592_000), "month");
  return rtf.format(Math.round(seconds / 31_536_000), "year");
}
