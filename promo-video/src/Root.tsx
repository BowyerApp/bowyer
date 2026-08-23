import { Composition } from "remotion";
import { BowyerVideo, DURATION } from "./Video";

export const Root: React.FC = () => (
  <Composition
    id="main"
    component={BowyerVideo}
    durationInFrames={DURATION}
    fps={30}
    width={1920}
    height={1080}
  />
);
