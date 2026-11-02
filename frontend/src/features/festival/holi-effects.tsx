"use client";

import { useEffect, useRef, useState } from "react";

const COLORS = ["#FF1A92", "#18E5F1", "#FFE252", "#8B46FF", "#FF8A1F", "#DFFF4E"];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
};

export function GymHoliEffects({ greeting = false }: { greeting?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!greeting) return;
    const onScroll = () => setHidden(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [greeting]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    let raf = 0;
    let running = true;
    const particles: Particle[] = [];
    let last = 0;

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

    const burst = (x: number, y: number) => {
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      for (let i = 0; i < 36; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 0.8 + Math.random() * 2.6;
        particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 1,
          color,
          size: 1.2 + Math.random() * 2,
        });
      }
    };

    const tick = (now: number) => {
      if (!running) return;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (!document.hidden) {
        if (now - last > 7800) {
          last = now;
          burst(40 + Math.random() * (window.innerWidth - 80), window.innerHeight * (0.18 + Math.random() * 0.3));
        }
        while (particles.length > 220) particles.shift();
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.02;
          p.life -= 0.012;
          if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
          }
          ctx.globalAlpha = Math.max(0, p.life) * 0.55;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    window.setTimeout(() => burst(window.innerWidth * 0.7, window.innerHeight * 0.28), 400);

    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="gym-festival-canvas" aria-hidden />
      {greeting ? (
        <p className={`gym-festival-greeting${hidden ? " is-hidden" : ""}`}>
          Happy Holi 2027 — Action Plus Gym
        </p>
      ) : null}
    </>
  );
}
