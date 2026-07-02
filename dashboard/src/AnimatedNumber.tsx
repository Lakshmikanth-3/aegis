import { useEffect, useRef, useState } from "react";

/** Interpolates from the previous value to `value` over 100ms whenever it changes. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const duration = 100;
    let raf: number;

    function tick(t: number) {
      const p = Math.min(1, (t - start) / duration);
      setDisplay(Math.round(from + (to - from) * p));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{display}</span>;
}
