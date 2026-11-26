import { Composition } from "remotion";
import { DURATION, OgCard } from "./OgCard";

const FPS = 30;

/** Every video, as Remotion Studio lists them. */
export function Root() {
  return (
    <Composition
      id="og"
      component={OgCard}
      durationInFrames={Math.round((DURATION / 1000) * FPS)}
      fps={FPS}
      width={1200}
      height={630}
    />
  );
}
