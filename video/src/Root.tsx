import "./index.css";
import { Composition } from "remotion";
import { data, Demo } from "./Composition";

export const RemotionRoot: React.FC = () => (
  <Composition id="TemtDemo" component={Demo} durationInFrames={Math.ceil(data.total * data.fps)} fps={data.fps} width={1920} height={1080} />
);
