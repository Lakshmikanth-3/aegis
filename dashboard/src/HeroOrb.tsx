import { PulsingBorder } from "@paper-design/shaders-react";

/** The landing hero's animated visual: a pulsing ring in the app's real
 * accent palette (green/purple/blue), standing in for "a shielded
 * commitment with a proof orbiting it" -- decorative, not derived from
 * live data. */
export function HeroOrb() {
  return (
    <PulsingBorder
      colors={["#2fe6a0", "#7c5cff", "#5d7bff", "#2dd4bf"]}
      colorBack="#00000000"
      speed={1.2}
      roundness={1}
      thickness={0.05}
      softness={0.15}
      intensity={1}
      spots={5}
      spotSize={0.1}
      pulse={0.15}
      smoke={0.5}
      smokeSize={2}
      scale={0.65}
      rotation={0}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
