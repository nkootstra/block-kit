// The preview's code views, which `Preview.tsx` loads only when a reader opens a JSON tab or an
// action log first shows something: `@pierre/diffs` and its syntax highlighter would otherwise be
// most of the JavaScript every docs page with a preview downloads.
import { Editor } from "@pierre/diffs/edit";
import { File as DiffsFile, type EditorFactory, EditProvider } from "@pierre/diffs/react";

/** Blume's own code themes, so the JSON reads like the page's other code blocks. */
const CODE_THEME = { light: "github-light", dark: "github-dark" } as const;

export type ColorMode = "light" | "dark";

/** Diffs' editor, for the editable JSON tab. */
const createEditor: EditorFactory<undefined, undefined> = (type, options, editStateKey) =>
  new Editor(type, options, editStateKey);

/** The JSON tab: the payload, editable, reporting every change. */
export function JsonEditor({
  source,
  editKey,
  colorMode,
  onChange,
}: {
  source: string;
  editKey: string;
  colorMode: ColorMode;
  onChange: (contents: string) => void;
}) {
  return (
    <EditProvider createEditor={createEditor}>
      <DiffsFile
        file={{ name: "payload.json", contents: source }}
        edit
        editStateKey={editKey}
        onEditChange={(event) => onChange(event.file.contents)}
        options={{
          theme: CODE_THEME,
          themeType: colorMode,
          overflow: "scroll",
          disableFileHeader: true,
        }}
      />
    </EditProvider>
  );
}

/** A read-only JSON file, for the action log. */
export function JsonView({
  name,
  contents,
  colorMode,
}: {
  name: string;
  contents: string;
  colorMode: ColorMode;
}) {
  return (
    <DiffsFile
      file={{ name, contents }}
      options={{
        theme: CODE_THEME,
        themeType: colorMode,
        overflow: "wrap",
        disableFileHeader: true,
      }}
    />
  );
}
