/**
 * Shared "code snippet" chrome used both by a `rich_text_preformatted` element that carries a
 * Builder-only `language` field, and by the Markdown block's fenced code blocks. Slack renders
 * these as a rounded card with a language label + copy button header, and a horizontally
 * scrolling, non-wrapping code area where each source line is its own line-box.
 */

const LANGUAGE_LABELS: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TypeScript",
  py: "Python",
  python: "Python",
  rb: "Ruby",
  ruby: "Ruby",
  go: "Go",
  golang: "Go",
  rs: "Rust",
  rust: "Rust",
  java: "Java",
  kotlin: "Kotlin",
  swift: "Swift",
  php: "PHP",
  c: "C",
  cpp: "C++",
  "c++": "C++",
  csharp: "C#",
  "c#": "C#",
  cs: "C#",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  sql: "SQL",
  bash: "Bash",
  sh: "Shell",
  shell: "Shell",
  markdown: "Markdown",
  md: "Markdown",
  graphql: "GraphQL",
  xml: "XML",
};

function languageLabel(language: string): string {
  const known = LANGUAGE_LABELS[language.toLowerCase()];
  if (known) return known;
  return language.charAt(0).toUpperCase() + language.slice(1);
}

export interface CodeBlockProps {
  language: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const lines = code.split("\n");
  return (
    <div className="sbk-code-block">
      <div className="sbk-code-block__box">
        <div className="sbk-code-block__header">
          <span className="sbk-code-block__language">{languageLabel(language)}</span>
          <button type="button" className="sbk-code-block__copy" aria-label="Copy code">
            <CopyIcon />
          </button>
        </div>
        <div className="sbk-code-block__scroll">
          <pre className="sbk-code-block__code">
            <code>
              {lines.map((line, i) => (
                <span key={i} className="sbk-code-block__line">
                  {line || " "}
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}

export function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" width="16" height="16">
      <path
        fill="currentColor"
        d="M6 2.5A1.5 1.5 0 0 1 7.5 1h7A1.5 1.5 0 0 1 16 2.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 6 11.5zm1.5-.5a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5zM4 5.5a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5.5.5 0 0 1 1 0A1.5 1.5 0 0 1 11 17H4a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 4 4.5a.5.5 0 0 1 0 1"
      />
    </svg>
  );
}
