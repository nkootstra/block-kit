import type { FileInput as FileInputElement } from "@slack/types";
import { useRef, useState } from "react";
import { useBlockKit } from "../context";
import { FileUploadIcon } from "../icons";
import type { ElementProps } from "../types";

interface PickedFile {
  id: string;
  name: string;
  filetype: string;
  size: number;
}

/** UI-only: there is no upload backend here, so picking a file just records its metadata in the
 * shape Slack's `files:read`-scoped apps receive, without actually transferring bytes anywhere. */
export function FileInput({ element, blockId }: ElementProps<FileInputElement>) {
  const { setValue, dispatch } = useBlockKit();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionId = element.action_id ?? "";
  const maxFiles = element.max_files ?? 10;

  function onChange(fileList: FileList | null) {
    if (!fileList) return;
    const picked: PickedFile[] = Array.from(fileList)
      .slice(0, maxFiles)
      .map((f, i) => ({
        id: `F${Date.now()}${i}`,
        name: f.name,
        filetype: f.name.split(".").pop() ?? "",
        size: f.size,
      }));
    setFiles(picked);
    setValue(blockId, actionId, { type: "file_input", files: picked });
    dispatch({ type: "file_input", action_id: actionId, block_id: blockId, files: picked });
  }

  return (
    <div className="sbk-file-input">
      {/* A button, as Slack's is, so it takes keyboard focus; it opens the hidden file input. */}
      <button
        type="button"
        className="sbk-file-input__button"
        onClick={() => inputRef.current?.click()}
      >
        <FileUploadIcon />
        {/* Slack keeps the singular label even when `max_files` allows several. */}
        <span>Upload File</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        className="sbk-file-input__native"
        multiple={maxFiles > 1}
        accept={element.filetypes?.map((t) => `.${t}`).join(",")}
        onChange={(e) => onChange(e.target.files)}
      />
      {files.length > 0 && (
        <ul className="sbk-file-input__list">
          {files.map((f) => (
            <li key={f.id} className="sbk-file-input__item">
              {f.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
