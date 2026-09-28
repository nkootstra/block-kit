import type { FileInput as FileInputElement } from "@slack/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider, type StateValues } from "../context";
import { FileInput } from "./FileInput";

afterEach(cleanup);

function file(name: string, size = 100) {
  return new File(["x".repeat(size)], name, { type: "text/plain" });
}

describe("<FileInput>", () => {
  it("records picked files as state and dispatches file metadata", () => {
    let state: StateValues = {};
    const onAction = vi.fn();
    render(
      <BlockKitProvider onAction={onAction} onStateChange={(s) => (state = s)}>
        <FileInput
          element={{ type: "file_input", action_id: "a1" } as unknown as FileInputElement}
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const native = document.querySelector(".sbk-file-input__native") as HTMLInputElement;
    fireEvent.change(native, { target: { files: [file("report.pdf")] } });

    expect(state.b1?.a1?.type).toBe("file_input");
    const files = state.b1?.a1?.files as { name: string }[];
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe("report.pdf");
    expect(screen.getByText("report.pdf")).toBeTruthy();

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "file_input", action_id: "a1", block_id: "b1" }),
      expect.anything(),
    );
  });

  it("caps the number of picked files at max_files", () => {
    let state: StateValues = {};
    render(
      <BlockKitProvider onStateChange={(s) => (state = s)}>
        <FileInput
          element={
            { type: "file_input", action_id: "a1", max_files: 1 } as unknown as FileInputElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    const native = document.querySelector(".sbk-file-input__native") as HTMLInputElement;
    fireEvent.change(native, { target: { files: [file("a.txt"), file("b.txt")] } });
    const files = state.b1?.a1?.files as unknown[];
    expect(files).toHaveLength(1);
  });

  it("keeps the singular button label even when several files are allowed", () => {
    render(
      <BlockKitProvider>
        <FileInput
          element={
            { type: "file_input", action_id: "a1", max_files: 1 } as unknown as FileInputElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByText("Upload File")).toBeTruthy();
    cleanup();
    render(
      <BlockKitProvider>
        <FileInput
          element={
            { type: "file_input", action_id: "a1", max_files: 3 } as unknown as FileInputElement
          }
          blockId="b1"
        />
      </BlockKitProvider>,
    );
    expect(screen.getByText("Upload File")).toBeTruthy();
  });
});
