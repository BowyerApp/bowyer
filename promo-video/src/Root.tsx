import { Composition } from "remotion";
import { BowyerVideo, DURATION } from "./Video";
import { BowyerLive, LIVE_DURATION } from "./Live";

export const Root: React.FC = () => (
  <>
    <Composition
      id="main"
      component={BowyerVideo}
      durationInFrames={DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="live"
      component={BowyerLive}
      durationInFrames={LIVE_DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
