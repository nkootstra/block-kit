import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BlockKitProvider } from "../context";
import type { HomeTabView } from "./HomeTab";
import { HomeTab } from "./HomeTab";
import type { ModalView } from "./Modal";
import { View } from "./View";

afterEach(cleanup);

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../../../../fixtures/extra");

function loadView<T>(path: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, `${path}.json`), "utf-8"));
}

describe("<HomeTab>", () => {
  it("renders a Home menu tab and the view's blocks", () => {
    const view = loadView<HomeTabView>("home/dashboard");
    render(
      <BlockKitProvider surface="home">
        <HomeTab view={view} />
      </BlockKitProvider>,
    );

    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your tickets" })).toBeTruthy();
  });
});

describe("<View>", () => {
  it("dispatches a home view to <HomeTab>", () => {
    const view = loadView<HomeTabView>("home/dashboard");
    render(
      <BlockKitProvider surface="home">
        <View view={view} />
      </BlockKitProvider>,
    );
    expect(document.querySelector(".sbk-home")).toBeTruthy();
  });

  it("dispatches a modal view to <Modal>", () => {
    const view = loadView<ModalView>("modal/rich-and-file");
    render(
      <BlockKitProvider surface="modal">
        <View view={view} />
      </BlockKitProvider>,
    );
    expect(document.querySelector(".sbk-modal")).toBeTruthy();
  });
});
