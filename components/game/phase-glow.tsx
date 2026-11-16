"use client";

import { useEffect, useRef } from "react";
import { useGame } from "./game-provider";
import type { Phase } from "./types";

type GlowMode = "night" | "day";

function phaseGlow(phase: Phase): GlowMode | null {
  switch (phase) {
    case "roleReveal":
    case "night":
    case "nightReport":
      return "night";
    case "dayDiscussion":
    case "voting":
    case "voteResult":
      return "day";
    default:
      return null;
  }
}

export function PhaseGlow() {
  const { state } = useGame();
  const mode = phaseGlow(state.phase);
  const visible = state.joined && state.phase !== "lobby";
  const nightRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLDivElement>(null);
  const previousMode = useRef<GlowMode | null>(null);

  useEffect(() => {
    const night = nightRef.current;
    const day = dayRef.current;
    if (!night || !day) return;

    const reset = (layer: HTMLDivElement) => {
      layer.getAnimations().forEach((animation) => animation.cancel());
      layer.style.opacity = "0";
    };

    if (!visible) {
      reset(night);
      reset(day);
      previousMode.current = null;
      return;
    }

    if (!mode) {
      const last = previousMode.current;
      if (!last) return;

      const active = last === "night" ? night : day;
      const inactive = last === "night" ? day : night;
      active.getAnimations().forEach((animation) => animation.cancel());
      active.style.opacity = "1";
      inactive.style.opacity = "0";
      return;
    }

    const active = mode === "night" ? night : day;
    const inactive = mode === "night" ? day : night;
    const previous = previousMode.current;

    if (!previous) {
      active.style.opacity = "1";
      inactive.style.opacity = "0";
      previousMode.current = mode;
      return;
    }

    if (previous === mode) {
      active.style.opacity = "1";
      inactive.style.opacity = "0";
      return;
    }

    const outgoing = previous === "night" ? night : day;
    const incoming = active;

    night.getAnimations().forEach((animation) => animation.cancel());
    day.getAnimations().forEach((animation) => animation.cancel());

    outgoing.style.opacity = "1";
    incoming.style.opacity = "0";
    previousMode.current = mode;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      outgoing.style.opacity = "0";
      incoming.style.opacity = "1";
      return;
    }

    const duration = 600;
    const out = outgoing.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration, easing: "ease-in-out", fill: "forwards" },
    );
    const inAnimation = incoming.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration, easing: "ease-in-out", fill: "forwards" },
    );

    const timer = window.setTimeout(() => {
      out.cancel();
      inAnimation.cancel();
      outgoing.style.opacity = "0";
      incoming.style.opacity = "1";
    }, duration + 50);

    return () => {
      window.clearTimeout(timer);
      out.cancel();
      inAnimation.cancel();
    };
  }, [visible, mode]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[42dvh] overflow-hidden"
    >
      <div
        ref={nightRef}
        data-glow="night"
        className="glow-night absolute inset-0 opacity-0"
      />
      <div
        ref={dayRef}
        data-glow="day"
        className="glow-day absolute inset-0 opacity-0"
      />
    </div>
  );
}
