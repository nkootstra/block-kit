import { useState } from "react";
import { Collapse } from "../data/Collapse";
import { CaretIcon } from "../data/icons";
import { RichTextMini } from "../data/richTextMini";
import { aggregateStatus, StatusIcon, type TaskStatus, TimelineIcon } from "../data/statusIcon";
import type { BlockProps, Json } from "../types";
import { Link } from "../Link";

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

/**
 * One step of the plan. As in Slack, a thin line joins each step's icon to the next, its details
 * start open, and the title is a button that hides and shows them instantly; a task with nothing
 * to reveal gets a disabled header and no caret.
 */
function TaskRow({ task }: { task: PlanTask }) {
  const [open, setOpen] = useState(true);
  const sources = Array.isArray(task.sources) ? task.sources : [];
  const expandable = Boolean(task.details || task.output || sources.length > 0);

  return (
    <li className="sbk-plan__task">
      <span className="sbk-plan__step" aria-hidden="true">
        <span className="sbk-plan__line sbk-plan__line--top" />
        <span className="sbk-plan__task-icon">
          <TimelineIcon status={task.status} />
        </span>
        <span className="sbk-plan__line sbk-plan__line--bottom" />
      </span>
      <div className="sbk-plan__task-content">
        <button
          type="button"
          className="sbk-plan__task-header"
          aria-expanded={open}
          aria-disabled={expandable ? undefined : true}
          onClick={() => {
            if (expandable) setOpen((value) => !value);
          }}
        >
          <span className="sbk-plan__task-title">{task.title}</span>
          {expandable ? (
            <span className="sbk-plan__task-caret">
              <CaretIcon direction={open ? "down" : "right"} />
            </span>
          ) : null}
        </button>
        {open && expandable ? (
          <div className="sbk-plan__task-body">
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
            {sources.length > 0 ? (
              <ul className="sbk-plan__task-sources">
                {sources.map((source, i) => (
                  <li key={source.url ?? i}>
                    <Link
                      className="sbk-plan__task-source-link"
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
        ) : null}
      </div>
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
      <Collapse open={expanded}>
        <ul className="sbk-plan__tasks">
          {tasks.map((task) => (
            <TaskRow key={task.task_id} task={task} />
          ))}
        </ul>
      </Collapse>
    </div>
  );
}
