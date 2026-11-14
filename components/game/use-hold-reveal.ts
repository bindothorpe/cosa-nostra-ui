"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HOLD_DELAY = 220;
const MOVE_TOLERANCE = 10;

export function useHoldReveal(delay = HOLD_DELAY) {
  const [shown, setShown] = useState(false);
  const timeout = useRef<number | null>(null);
  const holding = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timeout.current !== null) {
      window.clearTimeout(timeout.current);
      timeout.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    holding.current = false;
    origin.current = null;
    clearTimer();
    setShown(false);
  }, [clearTimer]);

  const start = useCallback(
    (point?: { x: number; y: number }) => {
      holding.current = true;
      origin.current = point ?? null;
      clearTimer();
      timeout.current = window.setTimeout(() => {
        timeout.current = null;
        if (holding.current) setShown(true);
      }, delay);
    },
    [clearTimer, delay],
  );

  useEffect(() => {
    const onRelease = () => stop();
    const onBlur = () => stop();
    const onPointerMove = (event: PointerEvent) => {
      if (!holding.current || shown) return;
      const point = origin.current;
      if (!point) return;
      const distance = Math.hypot(
        event.clientX - point.x,
        event.clientY - point.y,
      );
      if (distance > MOVE_TOLERANCE) stop();
    };

    window.addEventListener("pointerup", onRelease);
    window.addEventListener("pointercancel", onRelease);
    window.addEventListener("keyup", onRelease);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pointermove", onPointerMove);

    return () => {
      window.removeEventListener("pointerup", onRelease);
      window.removeEventListener("pointercancel", onRelease);
      window.removeEventListener("keyup", onRelease);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [shown, stop]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { shown, start, stop };
}
