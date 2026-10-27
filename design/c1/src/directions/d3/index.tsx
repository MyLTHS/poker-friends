import type { Direction } from "../../shared/direction";
import { FRAME } from "../../shared/screens";

// Placeholder until this direction is designed.
const direction: Direction = {
  id: "d3",
  name: "Chưa thiết kế",
  tagline: "",
  description: "",
  swatches: [],
  fonts: [],
  render: (screen, device) => (
    <div style={{ width: FRAME[device].width, height: FRAME[device].height, display: "grid", placeItems: "center", background: "#eee" }}>
      {screen}
    </div>
  ),
};

export default direction;
