"use client";

import { useEffect, useState } from "react";

export function GymChhathEffects({ greeting = false }: { greeting?: boolean }) {
  const [greetingHidden, setGreetingHidden] = useState(false);

  useEffect(() => {
    if (!greeting) return;
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setGreetingHidden((hidden) => (hidden ? y > 24 : y > 64));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [greeting]);

  return (
    <>
      <div className="gym-chhath-scene" aria-hidden>
        <span className="gym-chhath-glow" />
        <span className="gym-festival-diya gym-festival-diya-left" />
        <span className="gym-festival-diya gym-festival-diya-right" />
      </div>
      {greeting ? (
        <div
          className={`gym-festival-greeting${greetingHidden ? " is-hidden" : ""}`}
          aria-hidden
        >
          छठ पूजा की हार्दिक शुभकामनाएँ — Action Plus Gym
        </div>
      ) : null}
    </>
  );
}
