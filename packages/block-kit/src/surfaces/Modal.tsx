import { useState } from "react";
import { Blocks } from "../Blocks";
import { CloseIcon } from "../icons";
import {
  type StateValues,
  type SubmitResult,
  SurfaceScope,
  useBlockKit,
  useLiveView,
} from "../context";
import { buildViewClosedPayload, buildViewSubmissionPayload, type ViewLike } from "../payloads";
import { validateView } from "../validation";

export interface ModalView extends ViewLike {
  type: "modal";
}

export interface ModalProps {
  view: ModalView;
  /** App icon shown before the title, as in Slack's own modal chrome. */
  icon?: string;
}

/** A Slack modal: header (icon + title + close), a scrollable body of blocks, and a close/submit footer. */
export function Modal({ view: viewProp, icon }: ModalProps) {
  const { state, identity, onSubmit, onClose, views, stackedView, respond } = useBlockKit();
  // A modal opened through `views`: the X closes the whole stack (Slack's `is_cleared`), the
  // footer's close button goes back one view, and Submit applies the app's `response_action`.
  // Any other modal is standalone: `views.update` can still swap its content.
  const stacked = stackedView?.view.id === viewProp.id && viewProp.id !== undefined;
  const { view, update } = useLiveView(viewProp, !stacked);
  const [appErrors, setAppErrors] = useState<Record<string, string>>({});
  // Slack's own pre-submit checks. An error hides once its field changes.
  const [checked, setChecked] = useState<{ errors: Record<string, string>; state: StateValues }>();
  const clientErrors = Object.fromEntries(
    Object.entries(checked?.errors ?? {}).filter(([id]) => state[id] === checked?.state[id]),
  );
  const errors = stacked ? clientErrors : { ...appErrors, ...clientErrors };

  // Stacked modals are an app's own views, so they report `view_closed` only when it asked to
  // (`notify_on_close`), as Slack does. A standalone modal always reports it: its host needs to
  // know to hide it.
  const notify = !stacked || view.notify_on_close === true;
  const dismiss = () => {
    const isCleared = stacked && view.previous_view_id != null;
    if (notify) onClose?.(buildViewClosedPayload({ view, state, identity, isCleared }));
    if (stacked) views.clear();
  };
  const back = () => {
    if (notify) onClose?.(buildViewClosedPayload({ view, state, identity }));
    if (stacked && view.id) respond?.(view.id, undefined);
  };
  const submit = async () => {
    const invalid = validateView(view.blocks, state);
    setChecked({ errors: invalid, state });
    if (Object.keys(invalid).length > 0) return;

    setAppErrors({});
    let result: SubmitResult;
    try {
      result = await onSubmit?.(buildViewSubmissionPayload({ view, state, identity }), { views });
    } catch {
      // The app couldn't be reached or failed: like Slack, leave the modal open to retry.
      return;
    }
    if (stacked && view.id) {
      respond?.(view.id, result);
      return;
    }
    if (!result) return;
    if (result.response_action === "errors") setAppErrors(result.errors);
    else if (result.response_action === "update") update(result.view);
    else if (result.response_action === "push") views.push(result.view);
    else if (result.response_action === "clear") views.clear();
  };

  return (
    <div className="sbk-root sbk-modal" data-surface="modal">
      <div className="sbk-modal__header">
        <div className="sbk-modal__title-row">
          {icon && <img className="sbk-modal__icon" src={icon} alt="" />}
          <h2 className="sbk-modal__title">{view.title?.text}</h2>
        </div>
        <button type="button" className="sbk-modal__close" aria-label="Close" onClick={dismiss}>
          <CloseIcon width="20" height="20" />
        </button>
      </div>
      <div className="sbk-modal__body">
        <SurfaceScope container={{ type: "view", view }} errors={errors}>
          <Blocks blocks={view.blocks} />
        </SurfaceScope>
      </div>
      {(view.close || view.submit) && (
        <div className="sbk-modal__footer">
          {view.close && (
            <button
              type="button"
              className="sbk-modal__button sbk-modal__button--secondary"
              onClick={back}
            >
              {view.close.text}
            </button>
          )}
          {view.submit && (
            <button
              type="button"
              className="sbk-modal__button sbk-modal__button--primary"
              onClick={submit}
            >
              {view.submit.text}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
