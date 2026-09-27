import { describe, expect, it } from "vitest";
import { formatSlackDate } from "./date";

// 2014-02-18T14:39:42Z, the example from Slack's docs.
const TS = 1392734382;
const opts = { locale: "en-US", timeZone: "UTC" };

describe("formatSlackDate", () => {
  it("formats the documented tokens", () => {
    expect(formatSlackDate(TS, "{date_num}", opts)).toBe("2014-02-18");
    expect(formatSlackDate(TS, "{date_slash}", opts)).toBe("02/18/2014");
    expect(formatSlackDate(TS, "{date}", opts)).toBe("February 18th, 2014");
    expect(formatSlackDate(TS, "{date_short}", opts)).toBe("Feb 18, 2014");
    expect(formatSlackDate(TS, "{date_long}", opts)).toBe("Tuesday, February 18th, 2014");
    expect(formatSlackDate(TS, "{time}", opts)).toBe("2:39 PM");
    expect(formatSlackDate(TS, "{time_secs}", opts)).toBe("2:39:42 PM");
  });

  it("uses relative day names for _pretty tokens", () => {
    const now = (TS + 86_400) * 1000;
    expect(formatSlackDate(TS, "{date_pretty}", { ...opts, now })).toBe("Yesterday");
    expect(formatSlackDate(TS, "{date_short_pretty}", { ...opts, now: now + 86_400_000 })).toBe(
      "Feb 18, 2014",
    );
  });

  it("formats {ago}", () => {
    expect(formatSlackDate(TS, "{ago}", { ...opts, now: (TS + 180) * 1000 })).toBe("3 minutes ago");
  });

  it("keeps surrounding text and unknown tokens", () => {
    expect(formatSlackDate(TS, "Due {date_short} {nope}", opts)).toBe("Due Feb 18, 2014 {nope}");
  });
});
