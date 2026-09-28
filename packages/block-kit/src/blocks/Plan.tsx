import { useState } from "react";
import { CaretIcon } from "../data/icons";
import { RichTextMini } from "../data/richTextMini";
import { aggregateStatus, StatusIcon, type TaskStatus } from "../data/statusIcon";
import type { BlockProps, Json } from "../types";

interface PlanSource extends Json {
  type: "url";
  url: string;
  text?: string;
}

interface PlanTask extends Json {
  task_id: string;
  title: string;
  status: TaskStatus;
  details?: Json;
  output?: Json;
  sources?: PlanSource[];
}

interface PlanBlock extends Json {
  type: "plan";
  title: string;
  tasks: PlanTask[];
}

function TaskRow({ task }: { task: PlanTask }) {
  return (
    <li className="sbk-plan__task">
      <div className="sbk-plan__task-header">
        <span className="sbk-plan__task-icon">
          <StatusIcon status={task.status} />
        </span>
        <span className="sbk-plan__task-title">{task.title}</span>
      </div>
      {task.details ? (
        <div className="sbk-plan__task-details">
          <RichTextMini value={task.details} />
        </div>
      ) : null}
      {task.output ? (
        <div className="sbk-plan__task-output">
          <RichTextMini value={task.output} />
        </div>
      ) : null}
      {task.sources && task.sources.length > 0 ? (
        <ul className="sbk-plan__task-sources">
          {task.sources.map((source, i) => (
            <li key={source.url ?? i}>
              <a
                className="sbk-plan__task-source-link"
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
    </li>
  );
}

export function Plan({ block }: BlockProps<PlanBlock>) {
  const [expanded, setExpanded] = useState(false);
  const tasks = Array.isArray(block.tasks) ? block.tasks : [];
  const status = aggregateStatus(tasks.map((t) => t.status));

  return (
    <div className="sbk-plan">
      <button
        type="button"
        className="sbk-plan__pill"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="sbk-plan__pill-content">
          <span className="sbk-plan__pill-icon">
            <StatusIcon status={status} />
          </span>
          <span className="sbk-plan__pill-title">{block.title}</span>
          <span className="sbk-plan__pill-chevron">
            <CaretIcon direction={expanded ? "down" : "right"} />
          </span>
        </span>
      </button>
      {expanded ? (
        <ul className="sbk-plan__tasks">
          {tasks.map((task) => (
            <TaskRow key={task.task_id} task={task} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
