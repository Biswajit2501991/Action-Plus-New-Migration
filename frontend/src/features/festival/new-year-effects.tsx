"use client";

import { useEffect, useState } from "react";
import { GymDiwaliEffects } from "@/features/festival/diwali-effects";

export function GymNewYearEffects({ greeting = false }: { greeting?: boolean }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!greeting) return;
    const onScroll = () => setHidden(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [greeting]);

  return (
    <>
      <GymDiwaliEffects greeting={false} />
      {greeting ? (
        <p className={`gym-festival-greeting${hidden ? " is-hidden" : ""}`}>
          Happy New Year 2027 — Action Plus Gym
        </p>
      ) : null}
    </>
  );
}
