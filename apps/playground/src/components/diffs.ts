import { Editor } from "@pierre/diffs/edit";
import type { EditorFactory } from "@pierre/diffs/react";

/** Pierre's own themes (as on diffs.com), following the page's theme. */
export const DIFFS_THEME = { light: "pierre-light", dark: "pierre-dark" } as const;

/** Combines shared defaults with the per-surface options `EditProvider` requests. */
export const createEditor: EditorFactory<undefined, undefined> = (type, options, editStateKey) =>
  new Editor(type, options, editStateKey);
