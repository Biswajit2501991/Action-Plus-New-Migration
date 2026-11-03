"use client";

import { useEffect, useRef, useState } from "react";

const COLORS = ["#ffd76a", "#ff4d4d", "#4da3ff", "#c084fc", "#34d399", "#fb923c"];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  spark: boolean;
};

type Rocket = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  color: string;
  trail: { x: number; y: number }[];
};

function burst(particles: Particle[], x: number, y: number) {
  const count = 48 + Math.floor(Math.random() * 28);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const star = Math.random() > 0.45;
  for (let i = 0; i < count; i++) {
    const a = star ? (i / count) * Math.PI * 2 : Math.random() * Math.PI * 2;
    const sp = 1.6 + Math.random() * 3.4;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 1,
      max: 0.55 + Math.random() * 0.7,
      color,
      size: 1.4 + Math.random() * 2.2,
      spark: Math.random() > 0.7,
    });
  }
}

export function GymDiwaliEffects({ greeting = false }: { greeting?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let running = true;
    const particles: Particle[] = [];
    const rockets: Rocket[] = [];
    let lastRocket = 0;
    const lite = greeting;
    const rocketGap = lite ? 5200 : 2800;
    const maxParticles = lite ? 160 : 280;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const launch = () => {
      if (document.hidden) return;
      rockets.push({
        x: 40 + Math.random() * (window.innerWidth - 80),
        y: window.innerHeight + 8,
        vx: (Math.random() - 0.5) * 1.1,
        vy: -(6.2 + Math.random() * 2.4),
        targetY: window.innerHeight * (0.12 + Math.random() * 0.38),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        trail: [],
      });
    };

    const tick = (now: number) => {
      if (!running) return;
      if (document.hidden) {
        raf = 0;
        return;
      }
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (now - lastRocket > rocketGap + Math.random() * rocketGap * 0.4) {
        lastRocket = now;
        launch();
      }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx;
        r.y += r.vy;
        r.vy += 0.018;
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 14) r.trail.shift();
        ctx.beginPath();
        for (let t = 0; t < r.trail.length; t++) {
          const p = r.trail[t];
          ctx.strokeStyle = r.color;
          ctx.globalAlpha = (t / r.trail.length) * 0.55;
          ctx.lineWidth = 1.6;
          if (t === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff6c8";
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        if (r.y <= r.targetY || r.vy >= -0.4) {
          burst(particles, r.x, r.y);
          if (!lite && Math.random() > 0.55) {
            burst(particles, r.x + (Math.random() - 0.5) * 40, r.y + 10);
          }
          rockets.splice(i, 1);
        }
      }
      while (particles.length > maxParticles) particles.shift();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.018;
        p.vx *= 0.992;
        p.life -= 0.012;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        if (p.spark) {
          ctx.fillRect(p.x, p.y, p.size * 1.6, p.size * 0.5);
          ctx.fillRect(p.x, p.y, p.size * 0.5, p.size * 1.6);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      raf = window.requestAnimationFrame(tick);
    };
    const onVisible = () => {
      if (!document.hidden && running && !raf) raf = window.requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVisible);
    raf = window.requestAnimationFrame(tick);
    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("resize", resize);
      particles.length = 0;
      rockets.length = 0;
    };
  }, [greeting]);

  return (
    <>
      <canvas ref={canvasRef} className="gym-festival-canvas" aria-hidden />
      <div className="gym-festival-decor" aria-hidden>
        <span className="gym-festival-diya gym-festival-diya-left" />
        <span className="gym-festival-diya gym-festival-diya-right" />
      </div>
      {greeting ? (
        <div
          className={`gym-festival-greeting${greetingHidden ? " is-hidden" : ""}`}
          aria-hidden
        >
          🪔 Happy Diwali — Strength, Happiness, Prosperity &amp; Good Health
        </div>
      ) : null}
    </>
  );
}
