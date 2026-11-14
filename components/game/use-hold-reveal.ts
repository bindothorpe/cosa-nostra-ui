"use client";

import { useCallback, useEffect, useState } from "react";

export function useHoldReveal() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!shown) return;

    const hide = () => setShown(false);

    window.addEventListener("pointerup", hide);
    window.addEventListener("pointercancel", hide);
    window.addEventListener("keyup", hide);
    window.addEventListener("blur", hide);

    return () => {
      window.removeEventListener("pointerup", hide);
      window.removeEventListener("pointercancel", hide);
      window.removeEventListener("keyup", hide);
      window.removeEventListener("blur", hide);
    };
  }, [shown]);

  const start = useCallback(() => setShown(true), []);
  const stop = useCallback(() => setShown(false), []);

  return { shown, start, stop };
}
