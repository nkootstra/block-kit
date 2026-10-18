import type {
  RichTextBlock,
  RichTextBlockElement,
  RichTextElement,
  RichTextList,
  RichTextSection,
} from "@slack/types";
import { Fragment, type ReactNode } from "react";
import { type RenderCtx, renderLeaf } from "../blocks/RichText";

// The rich text input's value in and out of its editor: the initial value drawn as Slack's editor
// draws it, and the editor's content read back as the `rich_text` value Slack reports.

type Leaf = RichTextElement;
type Style = NonNullable<Extract<Leaf, { type: "text" }>["style"]>;
// Builder-only/undocumented extension to `@slack/types`' definition, as in RichText.tsx.
type RichTextListExt = RichTextList & { indent?: number };

/** Marks a leaf the editor can't edit as text (a mention, an emoji, a date), kept whole so the
 * value it reports carries the element as it came. */
const LEAF_ATTR = "data-sbk-leaf";

/** A section's leaves split into the lines its `\n`s make. */
function splitLines(elements: Leaf[]): Leaf[][] {
  const lines: Leaf[][] = [[]];
  for (const el of elements) {
    if (el.type !== "text") {
      lines[lines.length - 1]?.push(el);
      continue;
    }
    el.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1]?.push({ ...el, text: part });
    });
  }
  return lines;
}

function renderLine(leaves: Leaf[], ctx: RenderCtx): ReactNode {
  if (leaves.length === 0) return <br />;
  return leaves.map((leaf, i) =>
    leaf.type === "text" || leaf.type === "link" ? (
      <Fragment key={i}>{renderLeaf(leaf, ctx, 22)}</Fragment>
    ) : (
      <span key={i} contentEditable={false} {...{ [LEAF_ATTR]: JSON.stringify(leaf) }}>
        {renderLeaf(leaf, ctx, 22)}
      </span>
    ),
  );
}

function renderLines(elements: Leaf[], ctx: RenderCtx): ReactNode {
  return splitLines(elements).map((line, i) => <p key={i}>{renderLine(line, ctx)}</p>);
}

/**
 * The initial value as Slack's editor draws it (fixtures/extra/fidelity/rich-text-input/mixed): a
 * paragraph per line with its bold, italic, inline code and links, and lists, quotes and code
 * blocks as blocks of their own. Each leaf renders as it does in a rich_text block.
 */
export function renderRichTextValue(value: RichTextBlock | undefined, ctx: RenderCtx): ReactNode {
  return (value?.elements ?? []).map((block, i) => {
    switch (block.type) {
      case "rich_text_section":
        return <Fragment key={i}>{renderLines(block.elements, ctx)}</Fragment>;
      case "rich_text_list": {
        const List = block.style === "ordered" ? "ol" : "ul";
        return (
          <List
            key={i}
            className={`sbk-rich-list sbk-rich-list--${block.style}`}
            data-indent={(block as RichTextListExt).indent ?? 0}
          >
            {block.elements.map((item, j) => (
              <li key={j} className="sbk-rich-list__item">
                {renderLine(item.elements, ctx)}
              </li>
            ))}
          </List>
        );
      }
      case "rich_text_quote":
        return (
          <blockquote key={i} className="sbk-rich-text__quote">
            {renderLines(block.elements, ctx)}
          </blockquote>
        );
      case "rich_text_preformatted":
        return (
          <pre key={i} className="sbk-rich-text__pre">
            {block.elements.map((leaf, j) => (
              <Fragment key={j}>{renderLeaf(leaf, ctx, 22)}</Fragment>
            ))}
          </pre>
        );
      default:
        return null;
    }
  });
}

const STYLE_TAGS: Record<string, keyof Style> = {
  B: "bold",
  STRONG: "bold",
  I: "italic",
  EM: "italic",
  S: "strike",
  STRIKE: "strike",
  DEL: "strike",
  U: "underline",
  CODE: "code",
};

const LIST_TAGS = new Set(["UL", "OL"]);
const BLOCK_TAGS = new Set(["P", "DIV", "LI", "BLOCKQUOTE", "PRE", ...LIST_TAGS]);

function isBlock(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && BLOCK_TAGS.has(node.tagName);
}

function withStyle<T extends Leaf>(leaf: T, style: Style): T {
  return Object.keys(style).length > 0 ? { ...leaf, style } : leaf;
}

const NEWLINE: Leaf = { type: "text", text: "\n" };

/** The leaves of an inline run, each piece of text styled by the tags around it. */
function readInline(node: Node, style: Style, out: Leaf[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.textContent) out.push(withStyle({ type: "text", text: node.textContent }, style));
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  const kept = node.getAttribute(LEAF_ATTR);
  if (kept) out.push(JSON.parse(kept) as Leaf);
  else if (node.tagName === "BR") out.push(NEWLINE);
  else if (node.tagName === "A") {
    const url = node.getAttribute("href") ?? "";
    out.push(withStyle({ type: "link", url, text: node.textContent ?? "" }, style));
  } else {
    const key = STYLE_TAGS[node.tagName];
    const inner = key ? { ...style, [key]: true } : style;
    node.childNodes.forEach((child) => readInline(child, inner, out));
  }
}

/** Joins text with the same style, as Slack writes it, and drops a line's trailing `<br>` (the
 * browser's placeholder in an empty line). */
function tidy(leaves: Leaf[]): Leaf[] {
  const last = leaves[leaves.length - 1];
  const kept =
    last?.type === "text" && last.text === "\n" && !last.style ? leaves.slice(0, -1) : leaves;
  const merged: Leaf[] = [];
  for (const leaf of kept) {
    const prev = merged[merged.length - 1];
    if (
      leaf.type === "text" &&
      prev?.type === "text" &&
      JSON.stringify(prev.style ?? {}) === JSON.stringify(leaf.style ?? {})
    ) {
      merged[merged.length - 1] = { ...prev, text: prev.text + leaf.text };
    } else {
      merged.push(leaf);
    }
  }
  return merged;
}

function joinLines(lines: Leaf[][]): Leaf[] {
  return tidy(lines.flatMap((line, i) => (i > 0 ? [NEWLINE, ...line] : line)));
}

/** The lines of a block (a paragraph, a list item, a quote), joined with `\n`. Lists inside it are
 * left to the caller. */
function readLines(el: Element): Leaf[] {
  const lines: Leaf[][] = [];
  let run: Leaf[] | null = null;
  el.childNodes.forEach((child) => {
    if (isBlock(child)) {
      if (run) lines.push(tidy(run));
      run = null;
      if (!LIST_TAGS.has(child.tagName)) lines.push(readLines(child));
    } else {
      run ??= [];
      readInline(child, {}, run);
    }
  });
  if (run) lines.push(tidy(run));
  return joinLines(lines);
}

/**
 * The editor's content as the `rich_text` value Slack reports: consecutive lines joined with `\n`
 * into one section (so typed text is one section, as in
 * fixtures/contexts/rich_text_input/modal-input@submit.actions.json), lists, quotes and code blocks
 * as elements of their own, and bold, italic, strikethrough, underline, inline code and links kept.
 */
export function readRichTextValue(editor: HTMLElement): RichTextBlock {
  const blocks: RichTextBlockElement[] = [];
  let lines: Leaf[][] = [];
  let inline: Leaf[] | null = null;

  const endLine = () => {
    if (inline) lines.push(tidy(inline));
    inline = null;
  };
  const endSection = () => {
    endLine();
    if (lines.length > 0) blocks.push({ type: "rich_text_section", elements: joinLines(lines) });
    lines = [];
  };

  const readList = (list: HTMLElement, indent: number) => {
    const elements: RichTextSection[] = [];
    const nested: HTMLElement[] = [];
    for (const li of list.children) {
      elements.push({ type: "rich_text_section", elements: readLines(li) });
      for (const child of li.children)
        if (LIST_TAGS.has(child.tagName)) nested.push(child as HTMLElement);
    }
    blocks.push({
      type: "rich_text_list",
      style: list.tagName === "OL" ? "ordered" : "bullet",
      indent,
      elements,
    } as RichTextList);
    for (const child of nested) readList(child, indent + 1);
  };

  const walk = (container: Element) => {
    container.childNodes.forEach((child) => {
      if (!isBlock(child)) {
        inline ??= [];
        readInline(child, {}, inline);
        return;
      }
      endLine();
      if (LIST_TAGS.has(child.tagName)) {
        endSection();
        readList(child, Number(child.getAttribute("data-indent") ?? 0));
      } else if (child.tagName === "BLOCKQUOTE") {
        endSection();
        blocks.push({ type: "rich_text_quote", elements: readLines(child) });
      } else if (child.tagName === "PRE") {
        endSection();
        const elements: Leaf[] = [];
        readInline(child, {}, elements);
        blocks.push({
          type: "rich_text_preformatted",
          elements: tidy(elements),
        } as RichTextBlockElement);
      } else if ([...child.children].some(isBlock)) {
        // A wrapper the browser's own editing put around paragraphs.
        walk(child);
      } else {
        lines.push(readLines(child));
      }
    });
  };

  walk(editor);
  endSection();
  if (blocks.length === 0) blocks.push({ type: "rich_text_section", elements: [] });
  return { type: "rich_text", elements: blocks };
}

/** The formats Slack's toolbar shows as pressed for a caret at `node`, by the toolbar's labels. */
const FORMAT_LABELS: Record<string, string> = {
  B: "Bold",
  STRONG: "Bold",
  I: "Italic",
  EM: "Italic",
  U: "Underline",
  S: "Strikethrough",
  STRIKE: "Strikethrough",
  DEL: "Strikethrough",
  A: "Link",
  OL: "Ordered list",
  UL: "Bulleted list",
  BLOCKQUOTE: "Blockquote",
  CODE: "Code",
  PRE: "Code block",
};

export function formatsAt(node: Node | null, editor: HTMLElement): Set<string> {
  const formats = new Set<string>();
  for (let at = node; at && at !== editor; at = at.parentNode) {
    const label = at instanceof HTMLElement ? FORMAT_LABELS[at.tagName] : undefined;
    if (label) formats.add(label);
  }
  return formats;
}

/** The editor's first piece of text, where Slack's caret sits before the field is used. */
export function firstText(editor: HTMLElement): Node | null {
  return editor.ownerDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT).nextNode();
}
