import type { InlineNode, MrkdwnNode, Root } from "./ast";

export interface ParseOptions {
  /**
   * Mirrors the `verbatim` flag on Slack text objects. When `false` (Slack's default),
   * bare URLs are turned into links. When `true`, only explicit `<...>` markup is linked.
   */
  verbatim?: boolean;
}

type Marker = "*" | "_" | "~";

const MARKER_TYPES = { "*": "bold", _: "italic", "~": "strike" } as const;

const EMOJI_RE = /^:([a-z0-9_+'-]+):(?::skin-tone-([2-6]):)?/i;
const BARE_URL_RE = /^(?:https?:\/\/|www\.)[^\s<>]+/i;
/** Punctuation a bare URL doesn't end with: `see https://slack.com.` links without the period. */
const TRAILING_PUNCTUATION = new Set([".", ",", ";", ":", "!", "?", "'", '"', ")", "]"]);

/**
 * `url` without its trailing punctuation. A loop from the end rather than a regex, which would
 * retry from every punctuation character and take time quadratic in a run of them.
 */
function trimTrailingPunctuation(url: string): string {
  let end = url.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(url[end - 1] as string)) end--;
  return url.slice(0, end);
}

/** Parses Slack mrkdwn into an AST. Never throws: malformed markup is kept as text. */
export function parse(input: string, options: ParseOptions = {}): Root {
  return { type: "root", children: parseBlocks(input, options) };
}

export function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt);/g, (_, name: string) =>
    name === "amp" ? "&" : name === "lt" ? "<" : ">",
  );
}

function parseBlocks(input: string, options: ParseOptions): MrkdwnNode[] {
  const nodes: MrkdwnNode[] = [];
  let rest = input;

  while (rest.length > 0) {
    const open = rest.indexOf("```");
    const close = open === -1 ? -1 : rest.indexOf("```", open + 3);
    if (open === -1 || close === -1) {
      nodes.push(...parseQuotes(rest, options));
      break;
    }
    if (open > 0) nodes.push(...parseQuotes(stripTrailingNewline(rest.slice(0, open)), options));
    const value = rest.slice(open + 3, close);
    // Slack drops a single newline directly after the opening and before the closing fence.
    nodes.push({ type: "preformatted", value: decodeEntities(trimFenceNewlines(value)) });
    rest = stripLeadingNewline(rest.slice(close + 3));
  }

  return nodes;
}

/** Splits text into runs of quoted and unquoted lines. */
function parseQuotes(text: string, options: ParseOptions): MrkdwnNode[] {
  const nodes: MrkdwnNode[] = [];
  const lines = text.split("\n");
  let plain: string[] = [];
  let quoted: string[] = [];

  const flushPlain = () => {
    if (plain.length === 0) return;
    nodes.push(...parseInline(plain.join("\n"), options));
    plain = [];
  };
  const flushQuoted = () => {
    if (quoted.length === 0) return;
    nodes.push({ type: "quote", children: parseInline(quoted.join("\n"), options) });
    quoted = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const multi = matchQuotePrefix(line, true);
    if (multi !== null) {
      flushPlain();
      quoted.push(multi, ...lines.slice(i + 1));
      break;
    }
    const single = matchQuotePrefix(line, false);
    if (single !== null) {
      flushPlain();
      quoted.push(single);
    } else {
      flushQuoted();
      plain.push(line);
    }
  }
  flushPlain();
  flushQuoted();
  return nodes;
}

/** Returns the line without its quote prefix, or null when it isn't a quote line. */
function matchQuotePrefix(line: string, multi: boolean): string | null {
  const gt = "(?:>|&gt;)";
  const re = multi ? new RegExp(`^${gt}{3} ?`) : new RegExp(`^${gt} ?`);
  const match = re.exec(line);
  return match ? line.slice(match[0].length) : null;
}

function parseInline(text: string, options: ParseOptions): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = "";
  let i = 0;
  const nextIndex = indexFinder(text);
  const closers = closerFinder(text);

  const flush = () => {
    if (buffer) pushText(nodes, decodeEntities(buffer));
    buffer = "";
  };

  while (i < text.length) {
    const ch = text[i] as string;
    const prev = text[i - 1];

    if (ch === "`") {
      const end = nextIndex("`", i + 1);
      if (end > i + 1) {
        flush();
        nodes.push({ type: "code", value: decodeEntities(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "<") {
      const end = nextIndex(">", i + 1);
      if (end !== -1) {
        const node = parseAngle(text.slice(i + 1, end), options);
        if (node) {
          flush();
          nodes.push(node);
          i = end + 1;
          continue;
        }
      }
    }

    if (ch === "*" || ch === "_" || ch === "~") {
      if (isBoundary(prev)) {
        const end = closers(i, ch);
        if (end !== -1) {
          flush();
          nodes.push({
            type: MARKER_TYPES[ch],
            children: parseInline(text.slice(i + 1, end), options),
          });
          i = end + 1;
          continue;
        }
      }
    }

    if (ch === ":") {
      const match = EMOJI_RE.exec(text.slice(i));
      if (match) {
        flush();
        const skinTone = match[2] ? Number(match[2]) : undefined;
        nodes.push({
          type: "emoji",
          name: (match[1] as string).toLowerCase(),
          ...(skinTone ? { skinTone } : {}),
        });
        i += match[0].length;
        continue;
      }
    }

    if (!options.verbatim && (ch === "h" || ch === "w" || ch === "H" || ch === "W")) {
      if (isBoundary(prev)) {
        const match = BARE_URL_RE.exec(text.slice(i));
        if (match) {
          const raw = trimTrailingPunctuation(match[0]);
          if (raw.length > 0 && !/^www\.$/i.test(raw)) {
            flush();
            const url = decodeEntities(raw);
            nodes.push({
              type: "link",
              url: /^www\./i.test(url) ? `http://${url}` : url,
              children: [{ type: "text", value: url }],
            });
            i += raw.length;
            continue;
          }
        }
      }
    }

    buffer += ch;
    i++;
  }

  flush();
  return nodes;
}

/** Parses the inside of `<...>`. Returns null when it isn't recognized markup. */
function parseAngle(inner: string, options: ParseOptions): InlineNode | null {
  if (inner.length === 0) return null;
  const pipe = inner.indexOf("|");
  const target = pipe === -1 ? inner : inner.slice(0, pipe);
  const label = pipe === -1 ? undefined : inner.slice(pipe + 1);
  const withLabel = label !== undefined && label !== "" ? { label: decodeEntities(label) } : {};

  if (target.startsWith("@")) {
    const id = target.slice(1);
    return id ? { type: "user", id, ...withLabel } : null;
  }
  if (target.startsWith("#")) {
    const id = target.slice(1);
    return id ? { type: "channel", id, ...withLabel } : null;
  }
  if (target.startsWith("!")) {
    return parseSpecial(target.slice(1), label);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
    const url = decodeEntities(target);
    return label
      ? { type: "link", url, children: parseInline(label, { ...options, verbatim: true }) }
      : { type: "link", url };
  }
  return null;
}

function parseSpecial(command: string, label: string | undefined): InlineNode | null {
  const withLabel = label ? { label: decodeEntities(label) } : {};

  if (command === "here" || command === "channel" || command === "everyone") {
    return { type: "broadcast", range: command, ...withLabel };
  }
  if (command.startsWith("subteam^")) {
    const id = command.slice("subteam^".length);
    return id ? { type: "usergroup", id, ...withLabel } : null;
  }
  if (command.startsWith("date^")) {
    const [, ts, format, url] = command.split("^");
    const timestamp = Number(ts);
    if (!ts || !Number.isFinite(timestamp) || format === undefined) return null;
    return {
      type: "date",
      timestamp,
      format: decodeEntities(format),
      ...(url ? { url: decodeEntities(url) } : {}),
      fallback: decodeEntities(label ?? ""),
    };
  }
  return null;
}

/** Word boundary check for the character before an opening marker or after a closing one. */
function isBoundary(ch: string | undefined): boolean {
  return ch === undefined || !/[\p{L}\p{N}]/u.test(ch);
}

/**
 * `text.indexOf(char, from)`, remembering the last answer for each character. Every unclosed `<`
 * or backtick asks for the next `>` or backtick; without the memory each ask scanned to the end of
 * the text, so a long run of them took quadratic time.
 */
function indexFinder(text: string): (char: string, from: number) => number {
  const last = new Map<string, { from: number; at: number }>();
  return (char, from) => {
    const hit = last.get(char);
    // The first `char` at or after hit.from is hit.at, so it is also the first at or after any
    // `from` between the two (and there is none at all when hit.at is -1).
    if (hit && from >= hit.from && (hit.at === -1 || from <= hit.at)) return hit.at;
    const at = text.indexOf(char, from);
    last.set(char, { from, at });
    return at;
  };
}

/**
 * Finds the closing marker for a `*`, `_` or `~` span opening at a given index. The span must stay
 * on one line, have non-empty content that doesn't start or end with whitespace, and be followed by
 * a word boundary. Code spans and `<...>` markup are skipped so markers inside them don't count.
 *
 * A scan's path from any index it visits doesn't depend on where it started, so a scan that
 * reaches the end of its line without a closer marks every index it visited as a dead end for that
 * marker, and later scans stop there. Each index is then scanned at most once per marker, where
 * scanning every opener to the end of its line took quadratic time.
 */
function closerFinder(text: string): (start: number, marker: Marker) => number {
  const nextIndex = indexFinder(text);
  const dead: Partial<Record<Marker, Uint8Array>> = {};

  return (start, marker) => {
    const first = text[start + 1];
    // `first` is never the marker, so no index visited below can close the span at once.
    if (first === undefined || first === marker || /\s/.test(first)) return -1;

    const deadEnds = (dead[marker] ??= new Uint8Array(text.length));
    const visited: number[] = [];
    let found = -1;
    for (let j = start + 1; j < text.length; j++) {
      if (deadEnds[j]) break;
      visited.push(j);
      const ch = text[j];
      if (ch === "\n") break;
      if (ch === "`") {
        const end = nextIndex("`", j + 1);
        if (end !== -1) j = end;
        continue;
      }
      if (ch === "<") {
        const end = nextIndex(">", j + 1);
        if (end !== -1) j = end;
        continue;
      }
      if (ch === marker && !/\s/.test(text[j - 1] as string) && isBoundary(text[j + 1])) {
        found = j;
        break;
      }
    }
    if (found === -1) for (const j of visited) deadEnds[j] = 1;
    return found;
  };
}

function pushText(nodes: InlineNode[], value: string): void {
  const last = nodes[nodes.length - 1];
  if (last?.type === "text") last.value += value;
  else nodes.push({ type: "text", value });
}

function trimFenceNewlines(value: string): string {
  return stripTrailingNewline(stripLeadingNewline(value));
}

function stripLeadingNewline(value: string): string {
  return value.startsWith("\n") ? value.slice(1) : value;
}

function stripTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}
