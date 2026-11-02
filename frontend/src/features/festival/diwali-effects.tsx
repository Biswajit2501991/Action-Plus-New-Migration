"use client";

import { useEffect, useRef } from "react";

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
  const count = 16 + Math.floor(Math.random() * 10);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.55 + Math.random() * 1.4;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 1,
      max: 0.5 + Math.random() * 0.55,
      color,
      size: 1 + Math.random(),
      spark: Math.random() > 0.75,
    });
  }
}

export function GymDiwaliEffects({ greeting = false }: { greeting?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = (now: number) => {
      if (!running) return;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (!document.hidden) {
        if (now - lastRocket > 14000 + Math.random() * 6000) {
          lastRocket = now;
          rockets.push({
            x: 48 + Math.random() * (window.innerWidth - 96),
            y: window.innerHeight + 6,
            vx: (Math.random() - 0.5) * 0.8,
            vy: -(4.2 + Math.random() * 1.2),
            targetY: window.innerHeight * (0.16 + Math.random() * 0.22),
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            trail: [],
          });
        }
        for (let i = rockets.length - 1; i >= 0; i--) {
          const r = rockets[i];
          r.x += r.vx;
          r.y += r.vy;
          r.vy += 0.016;
          r.trail.push({ x: r.x, y: r.y });
          if (r.trail.length > 10) r.trail.shift();
          ctx.beginPath();
          r.trail.forEach((p, t) => {
            ctx.strokeStyle = r.color;
            ctx.globalAlpha = (t / r.trail.length) * 0.35;
            ctx.lineWidth = 1.2;
            if (t === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = "#fff6c8";
          ctx.beginPath();
          ctx.arc(r.x, r.y, 1.4, 0, Math.PI * 2);
          ctx.fill();
          if (r.y <= r.targetY || r.vy >= -0.3) {
            burst(particles, r.x, r.y);
            rockets.splice(i, 1);
          }
        }
        while (particles.length > 80) particles.shift();
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.014;
          p.life -= 0.014;
          if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
          }
          ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.55;
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
    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="gym-festival-canvas" aria-hidden />
      <div className="gym-festival-decor" aria-hidden>
        <span className="gym-festival-diya gym-festival-diya-left" />
        <span className="gym-festival-diya gym-festival-diya-right" />
      </div>
      {greeting ? (
        <div className="gym-festival-greeting" aria-hidden>
          🪔 Happy Diwali — Strength, Happiness, Prosperity &amp; Good Health
        </div>
      ) : null}
    </>
  );
}
