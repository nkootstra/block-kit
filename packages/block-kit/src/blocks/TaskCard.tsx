import { useState } from "react";
import { Collapse } from "../data/Collapse";
import { CaretIcon } from "../data/icons";
import { RichTextMini } from "../data/richTextMini";
import { DotIcon, StatusIcon, type TaskStatus } from "../data/statusIcon";
import type { BlockProps, Json } from "../types";
import { Link } from "../Link";

interface TaskCardSource extends Json {
  type: "url";
  url: string;
  text?: string;
}

interface TaskCardBlock extends Json {
  type: "task_card";
  task_id: string;
  title: string;
  status: TaskStatus;
  details?: Json;
  output?: Json;
  sources?: TaskCardSource[];
}

export function TaskCard({ block }: BlockProps<TaskCardBlock>) {
  const [expanded, setExpanded] = useState(false);
  const sources = Array.isArray(block.sources) ? block.sources : [];
  // Slack disables the toggle, and drops its caret, when the card has nothing to reveal.
  const expandable = Boolean(block.details || block.output || sources.length > 0);

  return (
    <div className="sbk-task-card">
      <button
        type="button"
        className="sbk-task-card__pill"
        aria-expanded={expanded}
        aria-disabled={expandable ? undefined : true}
        onClick={() => {
          if (expandable) setExpanded((value) => !value);
        }}
      >
        <span className="sbk-task-card__pill-content">
          <span className="sbk-task-card__pill-icon">
            <StatusIcon status={block.status} />
          </span>
          <span className="sbk-task-card__pill-title">{block.title}</span>
          {expandable ? (
            <span className="sbk-task-card__pill-chevron">
              <CaretIcon direction={expanded ? "down" : "right"} />
            </span>
          ) : null}
        </span>
      </button>
      <Collapse open={expanded}>
        <div className="sbk-task-card__body">
          {block.details ? (
            <div className="sbk-task-card__details">
              <RichTextMini value={block.details} />
            </div>
          ) : null}
          {block.output || sources.length > 0 ? (
            <div className="sbk-task-card__step">
              <div className="sbk-task-card__rail">
                <span className="sbk-task-card__dot">
                  <DotIcon status="pending" />
                </span>
                <span className="sbk-task-card__line" />
              </div>
              <div className="sbk-task-card__step-content">
                {block.output ? (
                  <div className="sbk-task-card__output">
                    <RichTextMini value={block.output} />
                  </div>
                ) : null}
                {sources.length > 0 ? (
                  <ul className="sbk-task-card__sources">
                    {sources.map((source, i) => (
                      <li key={source.url ?? i}>
                        <Link
                          className="sbk-task-card__source-link"
                          href={source.url}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {source.text ?? source.url}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </Collapse>
    </div>
  );
}
