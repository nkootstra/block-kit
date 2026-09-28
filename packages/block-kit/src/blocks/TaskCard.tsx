import { useState } from "react";
import { Collapse } from "../data/Collapse";
import { CaretIcon } from "../data/icons";
import { RichTextMini } from "../data/richTextMini";
import { StatusIcon, type TaskStatus } from "../data/statusIcon";
import type { BlockProps, Json } from "../types";

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

  return (
    <div className="sbk-task-card">
      <button
        type="button"
        className="sbk-task-card__pill"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="sbk-task-card__pill-content">
          <span className="sbk-task-card__pill-icon">
            <StatusIcon status={block.status} />
          </span>
          <span className="sbk-task-card__pill-title">{block.title}</span>
          <span className="sbk-task-card__pill-chevron">
            <CaretIcon direction={expanded ? "down" : "right"} />
          </span>
        </span>
      </button>
      <Collapse open={expanded}>
        <div className="sbk-task-card__body">
          {block.details ? (
            <div className="sbk-task-card__details">
              <RichTextMini value={block.details} />
            </div>
          ) : null}
          {block.output ? (
            <div className="sbk-task-card__output">
              <RichTextMini value={block.output} />
            </div>
          ) : null}
          {sources.length > 0 ? (
            <ul className="sbk-task-card__sources">
              {sources.map((source, i) => (
                <li key={source.url ?? i}>
                  <a
                    className="sbk-task-card__source-link"
                    href={source.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {source.text ?? source.url}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Collapse>
    </div>
  );
}
