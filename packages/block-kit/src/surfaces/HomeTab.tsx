import { Blocks } from "../Blocks";
import { SurfaceScope, useLiveView } from "../context";
import type { ViewLike } from "../payloads";

export interface HomeTabView extends ViewLike {
  type: "home";
}

export interface HomeTabProps {
  view: HomeTabView;
}

/** A Slack Home tab: just its blocks, laid out full width like Slack's App Home. */
export function HomeTab({ view: viewProp }: HomeTabProps) {
  // `views.publish` (or `views.update`) from an action swaps the content, as it would in Slack.
  const { view } = useLiveView(viewProp);

  return (
    <div className="sbk-root sbk-home" data-surface="home">
      <div className="sbk-home__menu">
        <span className="sbk-home__tab">
          <HomeIcon /> Home
        </span>
      </div>
      <div className="sbk-home__content">
        <SurfaceScope container={{ type: "view", view }}>
          <Blocks blocks={view.blocks} />
        </SurfaceScope>
      </div>
    </div>
  );
}

/** A filled house with a small window, like the glyph on Slack's Home tab. */
function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M9.3 2.4a1.25 1.25 0 0 1 1.4 0l7 4.7a.75.75 0 0 1-.7 1.3v6.2c0 2.1-1.7 3.9-3.8 3.9H6.8C4.7 18.5 3 16.7 3 14.6V8.4a.75.75 0 0 1-.7-1.3zM11.5 10.5a.5.5 0 0 0-.5.5v1.5a.5.5 0 0 0 .5.5H13a.5.5 0 0 0 .5-.5V11a.5.5 0 0 0-.5-.5z"
      />
    </svg>
  );
}
