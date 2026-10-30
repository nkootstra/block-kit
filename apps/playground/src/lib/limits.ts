import type { Surface } from "@nkootstra/block-kit";
import type { Payload } from "../payload";

type Obj = Record<string, unknown>;

/**
 * Slack's documented limits that a payload most often breaks, as warnings: the preview still
 * draws the payload, but Slack would refuse it (`invalid_blocks`). The numbers are the ones in
 * apps/docs/docs/reference/limits.mdx, which links each to docs.slack.dev, and in
 * tools/visual/src/fidelity/limits.ts (which checks the fixtures against them):
 *
 * - 50 blocks in a message: docs.slack.dev/block-kit
 * - 100 blocks in a modal: docs.slack.dev/reference/views/modal-views
 * - 100 blocks in a Home tab: docs.slack.dev/reference/views/home-tab-views
 * - 24 characters for a modal's title, submit and close: docs.slack.dev/reference/views/modal-views
 * - 100 attachments in a message: docs.slack.dev/reference/methods/chat.postMessage
 * - 3,000 characters of section text: docs.slack.dev/reference/block-kit/blocks/section-block
 * - 150 characters of header text: docs.slack.dev/reference/block-kit/blocks/header-block
 */
export const LIMITS = {
  messageBlocks: 50,
  modalBlocks: 100,
  homeBlocks: 100,
  modalText: 24,
  attachments: 100,
  sectionText: 3000,
  headerText: 150,
} as const;

/** Where the docs list every limit. */
export const LIMITS_URL = "https://docs.block-kit.dev/reference/limits";

const count = (n: number) => n.toLocaleString("en-US");
const textOf = (v: unknown): string | undefined =>
  v && typeof v === "object" && typeof (v as Obj).text === "string"
    ? ((v as Obj).text as string)
    : undefined;

function blockWarnings(blocks: unknown[], path: string): string[] {
  const warnings: string[] = [];
  blocks.forEach((block, i) => {
    const b = block as Obj;
    const text = textOf(b.text);
    if (text === undefined) return;
    const max =
      b.type === "section" ? LIMITS.sectionText : b.type === "header" ? LIMITS.headerText : 0;
    if (max && text.length > max) {
      warnings.push(
        `${path}[${i}] (${String(b.type)}) has ${count(text.length)} characters of text; Slack allows ${count(max)}.`,
      );
    }
  });
  return warnings;
}

/** What Slack would refuse in `payload` shown on `surface`, in words; empty when nothing is. */
export function limitWarnings(
  payload: Pick<Payload, "blocks" | "view" | "message">,
  surface: Surface,
): string[] {
  const warnings: string[] = [];
  const { blocks } = payload;
  const maxBlocks =
    surface === "modal"
      ? LIMITS.modalBlocks
      : surface === "home"
        ? LIMITS.homeBlocks
        : LIMITS.messageBlocks;
  const where = surface === "modal" ? "a modal" : surface === "home" ? "a Home tab" : "a message";
  if (blocks.length > maxBlocks) {
    warnings.push(`${count(blocks.length)} blocks: Slack allows ${count(maxBlocks)} in ${where}.`);
  }
  warnings.push(...blockWarnings(blocks, "blocks"));

  if (surface === "modal" && payload.view) {
    for (const key of ["title", "submit", "close"]) {
      const text = textOf(payload.view[key]);
      if (text !== undefined && text.length > LIMITS.modalText) {
        warnings.push(
          `The modal's ${key} has ${count(text.length)} characters; Slack allows ${LIMITS.modalText}.`,
        );
      }
    }
  }

  const attachments = surface === "message" ? (payload.message?.attachments ?? []) : [];
  if (attachments.length > LIMITS.attachments) {
    warnings.push(
      `${count(attachments.length)} attachments: Slack allows ${LIMITS.attachments} in a message.`,
    );
  }
  attachments.forEach((attachment, i) => {
    if (Array.isArray(attachment.blocks)) {
      warnings.push(...blockWarnings(attachment.blocks, `attachments[${i}].blocks`));
    }
  });
  return warnings;
}
