import { describe, expect, test } from "bun:test";
import { directoryOrder } from "./directoryOrder";

const open = (text: string) => ({ text, locked: false });

describe("directoryOrder", () => {
  test("lists the redacted names in the order the options show them", () => {
    expect(
      directoryOrder([
        open("channel-one"),
        open("User One (you)"),
        { text: " channel-two", locked: true },
        open("User Two User Two"),
      ]),
    ).toEqual(["channel-one", "User One", "channel-two:private", "User Two"]);
  });

  test("skips options that aren't directory entries and repeats", () => {
    expect(directoryOrder([open("Option 1"), open("channel-one"), open("channel-one")])).toEqual([
      "channel-one",
    ]);
  });
});
