import type { HomeTabView, ModalView } from "@nkootstra/block-kit";

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
