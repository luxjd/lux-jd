"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";

const HERO_IMAGES = [
  { src: "/hero/hero1.jpg", alt: "Luxury supercar in dramatic lighting" },
  { src: "/hero/hero2.jpg", alt: "Porsche on open road" },
  { src: "/hero/hero3.jpg", alt: "Lamborghini in moody setting" },
  { src: "/hero/hero4.jpg", alt: "Red supercar front view" },
  { src: "/hero/hero5.jpg", alt: "BMW luxury car in dark setting" },
];

const CYCLE_DURATION = 5000; // ms per image
const FADE_DURATION = 1500;  // ms crossfade

/**
 * Option B: Rotating car showcase.
 * All images are stacked. Only the active one has opacity:1.
 * Active image slowly zooms in (Ken Burns). Crossfade is pure CSS transition.
 */
export function HeroCarousel() {
  const [active, setActive] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setActive((prev) => (prev + 1) % HERO_IMAGES.length);
    }, CYCLE_DURATION);
    return () => clearInterval(timerRef.current);
  }, []);

  return (
    <div className="absolute inset-0 z-0">
      {/* All images stacked — only active is visible */}
      {HERO_IMAGES.map((img, i) => {
        const isActive = i === active;
        return (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              opacity: isActive ? 1 : 0,
              transform: isActive ? "scale(1.08)" : "scale(1.02)",
              transition: `opacity ${FADE_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${CYCLE_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              zIndex: isActive ? 1 : 0,
            }}
          >
            <Image
              src={img.src}
              alt={img.alt}
              fill
              priority={i === 0}
              quality={100}
              sizes="100vw"
              unoptimized
              className="object-cover brightness-[0.65] contrast-[1.1] saturate-[1.2]"
            />
          </div>
        );
      })}

      {/* Gradient — only darken top/bottom edges for text readability */}
      <div className="absolute inset-0 z-[2]" style={{ background: "linear-gradient(to bottom, rgba(19,19,19,0.5) 0%, transparent 30%, transparent 60%, rgba(19,19,19,0.7) 100%)" }} />

      {/* Subtle vignette — much lighter */}
      <div
        className="absolute inset-0 z-[3]"
        style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)" }}
      />

      {/* Progress indicators */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[4] flex gap-2.5 pointer-events-auto">
        {HERO_IMAGES.map((_, i) => (
          <button
            key={i}
            onClick={() => {
              setActive(i);
              clearInterval(timerRef.current);
              timerRef.current = setInterval(() => {
                setActive((prev) => (prev + 1) % HERO_IMAGES.length);
              }, CYCLE_DURATION);
            }}
            className="group relative w-10 h-[3px] rounded-full overflow-hidden bg-white/15 cursor-pointer"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: i === active ? "100%" : "0%",
                background: i === active
                  ? "linear-gradient(90deg, var(--color-primary), var(--color-secondary))"
                  : "transparent",
                transition: i === active
                  ? `width ${CYCLE_DURATION}ms linear`
                  : "width 300ms ease-out",
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Option D: Typing effect for the subtitle.
 */
export function TypingText({ text, delay = 0, speed = 35, className = "" }) {
  const [displayed, setDisplayed] = useState("");
  const [showCursor, setShowCursor] = useState(true);
  const indexRef = useRef(0);

  useEffect(() => {
    // Wait for initial delay
    const delayTimer = setTimeout(() => {
      const interval = setInterval(() => {
        indexRef.current++;
        if (indexRef.current <= text.length) {
          setDisplayed(text.slice(0, indexRef.current));
        } else {
          clearInterval(interval);
          // Blink cursor a few times then hide
          setTimeout(() => setShowCursor(false), 2000);
        }
      }, speed);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(delayTimer);
  }, [text, delay, speed]);

  return (
    <span className={className}>
      {displayed}
      <span
        className="inline-block w-[2px] h-[1em] bg-primary ml-1 align-middle"
        style={{
          opacity: showCursor ? 1 : 0,
          animation: showCursor ? "cursorBlink 0.8s step-end infinite" : "none",
        }}
      />
    </span>
  );
}

/**
 * Combined: ambient effects (fog, motes) + Option C interactive parallax.
 * Mouse movement shifts carousel images opposite, text with cursor, particles mid-layer.
 * Cursor-following glow spotlight.
 */
export default function HeroDrift() {
  const canvasRef = useRef(null);
  const glowRef = useRef(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5 });

  const handleMouseMove = useCallback((e) => {
    mouseRef.current.targetX = e.clientX / window.innerWidth;
    mouseRef.current.targetY = e.clientY / window.innerHeight;
  }, []);

  // Parallax: move carousel bg + text layer + cursor glow
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth < 768) return;

    const container = canvasRef.current?.closest("section");
    if (!container) return;

    const bgLayer = container.querySelector("[data-parallax-bg]");
    const textLayer = container.querySelector("[data-parallax-text]");
    const glow = glowRef.current;
    let raf;

    const lerp = (a, b, t) => a + (b - a) * t;

    const animate = () => {
      const m = mouseRef.current;
      m.x = lerp(m.x, m.targetX, 0.04);
      m.y = lerp(m.y, m.targetY, 0.04);

      const ox = (m.x - 0.5) * 2; // -1 to 1
      const oy = (m.y - 0.5) * 2;

      // Background images: shift opposite for depth (strong movement)
      if (bgLayer) {
        bgLayer.style.transform = `translate(${-ox * 25}px, ${-oy * 18}px)`;
      }

      // Text: shift with cursor (foreground feel)
      if (textLayer) {
        textLayer.style.transform = `translate(${ox * 12}px, ${oy * 8}px)`;
      }

      // Cursor glow spotlight
      if (glow) {
        glow.style.background = `radial-gradient(700px circle at ${m.x * 100}% ${m.y * 100}%, rgba(248,113,113,0.08) 0%, rgba(255,138,101,0.04) 40%, transparent 70%)`;
      }

      raf = requestAnimationFrame(animate);
    };

    window.addEventListener("mousemove", handleMouseMove);
    raf = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(raf);
    };
  }, [handleMouseMove]);

  // Ambient particles with parallax offset
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || window.innerWidth < 768) return;

    const ctx = canvas.getContext("2d");
    let w, h, raf;
    const dpr = Math.min(window.devicePixelRatio, 2);

    const resize = () => {
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const fogParticles = [];
    const createFog = () => ({
      x: Math.random() * w,
      y: h * 0.65 + Math.random() * h * 0.35,
      size: Math.random() * 80 + 30,
      alpha: Math.random() * 0.06 + 0.02,
      vx: (Math.random() - 0.3) * 0.3,
      vy: -Math.random() * 0.2 - 0.05,
      life: 1,
      decay: Math.random() * 0.0008 + 0.0004,
      growRate: Math.random() * 0.15 + 0.05,
    });
    for (let i = 0; i < 25; i++) fogParticles.push(createFog());

    const motes = [];
    for (let i = 0; i < 15; i++) {
      motes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.4 + 0.1,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.1,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.015 + 0.005,
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, w, h);

      // Parallax offset for particles (mid-layer — between bg and text)
      const m = mouseRef.current;
      const pox = (m.x - 0.5) * -18;
      const poy = (m.y - 0.5) * -12;

      for (let i = fogParticles.length - 1; i >= 0; i--) {
        const p = fogParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        p.size += p.growRate;
        if (p.life <= 0 || p.y < h * 0.3) { fogParticles[i] = createFog(); continue; }

        const dx = p.x + pox;
        const dy = p.y + poy;
        const grad = ctx.createRadialGradient(dx, dy, 0, dx, dy, p.size);
        grad.addColorStop(0, `rgba(248, 113, 113, ${p.alpha * p.life})`);
        grad.addColorStop(0.5, `rgba(200, 90, 90, ${p.alpha * p.life * 0.4})`);
        grad.addColorStop(1, "rgba(200, 90, 90, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(dx, dy, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const mt of motes) {
        mt.x += mt.vx;
        mt.y += mt.vy;
        mt.pulse += mt.pulseSpeed;
        if (mt.x < 0) mt.x = w;
        if (mt.x > w) mt.x = 0;
        if (mt.y < 0) mt.y = h;
        if (mt.y > h) mt.y = 0;

        const a = mt.alpha * (0.4 + 0.6 * Math.sin(mt.pulse));
        ctx.globalAlpha = a;
        ctx.fillStyle = "rgba(255, 200, 180, 1)";
        ctx.beginPath();
        ctx.arc(mt.x + pox * 0.5, mt.y + poy * 0.5, mt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-[5] pointer-events-none overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Cursor-following glow */}
      <div ref={glowRef} className="absolute inset-0" />

      {/* Bottom atmospheric glow */}
      <div className="absolute bottom-0 left-0 w-full h-[25%]" style={{ background: "linear-gradient(to top, rgba(248,113,113,0.03) 0%, transparent 100%)" }} />
    </div>
  );
}
