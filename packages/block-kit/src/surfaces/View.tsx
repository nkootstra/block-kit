import { HomeTab, type HomeTabView } from "./HomeTab";
import { Modal, type ModalView } from "./Modal";

export type AnyView = ModalView | HomeTabView;

export interface ViewProps {
  view: AnyView;
  /** App icon shown before the modal title. No effect on the Home tab (Slack doesn't show it there). */
  icon?: string;
}

/** Dispatches a Slack `view` payload (as from `views.open`/`views.publish`) to `<Modal>` or `<HomeTab>`. */
export function View({ view, icon }: ViewProps) {
  if (view.type === "home") return <HomeTab view={view} />;
  return <Modal view={view} icon={icon} />;
}
