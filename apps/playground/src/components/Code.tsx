import { File as DiffsFile, EditProvider } from "@pierre/diffs/react";
import type * as stylex from "@stylexjs/stylex";
import { createEditor, DIFFS_THEME } from "./diffs";

/**
 * The JSON editor and the read-only payload viewer, both `@pierre/diffs`. It's the largest
 * dependency, so `LazyCode.tsx` loads this module after the first paint.
 */
export function CodeEditor({
  value,
  onChange,
  theme,
}: {
  value: string;
  onChange: (value: string) => void;
  theme: "light" | "dark";
}) {
  return (
    // Remounted on a theme change: the editor reads its theme once, when it mounts, so switching
    // it in place leaves the editor a theme behind the page.
    <EditProvider key={theme} createEditor={createEditor}>
      <DiffsFile
        file={{ name: "payload.json", contents: value }}
        edit
        editStateKey="playground-source"
        onEditChange={(event) => onChange(event.file.contents)}
        options={{
          theme: DIFFS_THEME,
          themeType: theme,
          overflow: "scroll",
          disableFileHeader: true,
        }}
      />
    </EditProvider>
  );
}

export function CodeViewer({
  value,
  theme,
  className,
}: {
  value: string;
  theme: "light" | "dark";
  className?: ReturnType<typeof stylex.props>["className"];
}) {
  return (
    <DiffsFile
      key={theme}
      className={className}
      file={{ name: "payload.json", contents: value }}
      options={{
        theme: DIFFS_THEME,
        themeType: theme,
        overflow: "wrap",
        disableFileHeader: true,
      }}
    />
  );
}
