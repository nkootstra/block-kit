import type { HomeTabView, ModalView, Surface } from "@nkootstra/block-kit";

/** A payload's own `"type"` field, when it's a raw modal/home view rather than a blocks array. */
export function detectSurface(json: string): Surface {
  try {
    const value = JSON.parse(json);
    if (value && typeof value === "object" && "type" in value) {
      const type = (value as { type: unknown }).type;
      if (type === "modal" || type === "home") return type;
    }
  } catch {
    // Fall through to the default below; the editor's error bar says why it doesn't parse.
  }
  return "message";
}

/** Fills in the title/close/submit Slack requires for a modal, so any blocks array previews. */
export function toModalView(raw: unknown, blocks: ModalView["blocks"]): ModalView {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    id: "V00000000",
    type: "modal",
    blocks,
    callback_id: typeof obj.callback_id === "string" ? obj.callback_id : undefined,
    private_metadata: typeof obj.private_metadata === "string" ? obj.private_metadata : undefined,
    title: (obj.title as ModalView["title"]) ?? { type: "plain_text", text: "Preview" },
    close: (obj.close as ModalView["close"]) ?? { type: "plain_text", text: "Cancel" },
    submit: (obj.submit as ModalView["submit"]) ?? { type: "plain_text", text: "Submit" },
  };
}

export function toHomeView(raw: unknown, blocks: HomeTabView["blocks"]): HomeTabView {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    id: "V00000000",
    type: "home",
    blocks,
    callback_id: typeof obj.callback_id === "string" ? obj.callback_id : undefined,
    private_metadata: typeof obj.private_metadata === "string" ? obj.private_metadata : undefined,
  };
}

/** A view object (modal or Home tab) rather than a blocks payload. */
export function isView(raw: unknown): boolean {
  return Boolean(raw && typeof raw === "object" && !Array.isArray(raw) && "type" in raw);
}
