"use client";

import { useEffect, useRef, useCallback } from "react";
import gsap from "gsap";

/**
 * Cinematic hero with interactive parallax.
 *
 * Mouse movement shifts layers at different speeds:
 * - Background image: slow (depth layer)
 * - Particles/fog: medium
 * - Vignette glow: follows cursor
 *
 * Text layer is controlled separately in page.js via CSS class.
 */
export default function HeroDrift() {
  const canvasRef = useRef(null);
  const sweepRef = useRef(null);
  const containerRef = useRef(null);
  const glowRef = useRef(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5 });

  // Smooth mouse tracking
  const handleMouseMove = useCallback((e) => {
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    mouseRef.current.targetX = x;
    mouseRef.current.targetY = y;
  }, []);

  // Parallax on background image + glow follow
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth < 768) return;

    const heroSection = containerRef.current?.closest("section");
    if (!heroSection) return;

    const bgLayer = heroSection.querySelector("[data-parallax-bg]");
    const textLayer = heroSection.querySelector("[data-parallax-text]");
    const glow = glowRef.current;
    let raf;

    const lerp = (a, b, t) => a + (b - a) * t;

    const animate = () => {
      const m = mouseRef.current;
      // Smooth interpolation
      m.x = lerp(m.x, m.targetX, 0.06);
      m.y = lerp(m.y, m.targetY, 0.06);

      const offsetX = (m.x - 0.5) * 2; // -1 to 1
      const offsetY = (m.y - 0.5) * 2;

      // Background: moves opposite to mouse (parallax depth)
      if (bgLayer) {
        bgLayer.style.transform = `translate(${-offsetX * 15}px, ${-offsetY * 10}px) scale(1.08)`;
      }

      // Text: moves slightly with mouse (foreground)
      if (textLayer) {
        textLayer.style.transform = `translate(${offsetX * 8}px, ${offsetY * 5}px)`;
      }

      // Cursor glow
      if (glow) {
        glow.style.background = `radial-gradient(600px circle at ${m.x * 100}% ${m.y * 100}%, rgba(173,198,255,0.06) 0%, rgba(234,193,105,0.03) 40%, transparent 70%)`;
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

  // Ambient particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.innerWidth < 768) return;

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

    // Ground fog
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
    for (let i = 0; i < 30; i++) fogParticles.push(createFog());

    // Dust motes
    const motes = [];
    for (let i = 0; i < 20; i++) {
      motes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 1.8 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.1,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.015 + 0.005,
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, w, h);

      // Parallax offset for particles (medium speed)
      const m = mouseRef.current;
      const pOffsetX = (m.x - 0.5) * 10;
      const pOffsetY = (m.y - 0.5) * 6;

      // Fog
      for (let i = fogParticles.length - 1; i >= 0; i--) {
        const p = fogParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        p.size += p.growRate;

        if (p.life <= 0 || p.y < h * 0.3) {
          fogParticles[i] = createFog();
          continue;
        }

        const drawX = p.x + pOffsetX;
        const drawY = p.y + pOffsetY;
        const grad = ctx.createRadialGradient(drawX, drawY, 0, drawX, drawY, p.size);
        grad.addColorStop(0, `rgba(173, 198, 255, ${p.alpha * p.life})`);
        grad.addColorStop(0.5, `rgba(140, 160, 200, ${p.alpha * p.life * 0.4})`);
        grad.addColorStop(1, "rgba(140, 160, 200, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(drawX, drawY, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Motes
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
        ctx.fillStyle = "rgba(220, 230, 255, 1)";
        ctx.beginPath();
        ctx.arc(mt.x + pOffsetX * 0.5, mt.y + pOffsetY * 0.5, mt.size, 0, Math.PI * 2);
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

  // GSAP cinematic entry
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth < 768) return;

    const sweep = sweepRef.current;
    const container = containerRef.current;
    if (!sweep || !container) return;

    const tl = gsap.timeline();

    gsap.set(sweep, { x: "-110%", opacity: 0 });
    tl.to(sweep, { opacity: 1, duration: 0.2, ease: "power2.in" }, 0.8);
    tl.to(sweep, { x: "250%", duration: 2.0, ease: "power2.inOut" }, 0.8);
    tl.to(sweep, { opacity: 0, duration: 0.4, ease: "power2.out" }, 2.3);

    // Camera shake
    tl.to(container, { x: -5, y: 2, duration: 0.04, ease: "none" }, 1.3);
    tl.to(container, { x: 6, y: -3, duration: 0.04, ease: "none" }, 1.34);
    tl.to(container, { x: -4, y: 3, duration: 0.04, ease: "none" }, 1.38);
    tl.to(container, { x: 5, y: -2, duration: 0.04, ease: "none" }, 1.42);
    tl.to(container, { x: -2, y: 1, duration: 0.04, ease: "none" }, 1.46);
    tl.to(container, { x: 0, y: 0, duration: 0.25, ease: "power2.out" }, 1.5);

    return () => tl.kill();
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 z-[5] pointer-events-none overflow-hidden">
      {/* Particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Neon light sweep */}
      <div
        ref={sweepRef}
        className="absolute inset-y-0 w-[35%] opacity-0"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(173,198,255,0.08) 25%, rgba(255,255,255,0.04) 50%, rgba(234,193,105,0.06) 75%, transparent 100%)",
          filter: "blur(30px)",
        }}
      />

      {/* Cursor-following glow */}
      <div
        ref={glowRef}
        className="absolute inset-0 transition-none"
      />

      {/* Vignette */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.45) 100%)" }} />

      {/* Bottom atmospheric glow */}
      <div className="absolute bottom-0 left-0 w-full h-[25%]" style={{ background: "linear-gradient(to top, rgba(173,198,255,0.03) 0%, transparent 100%)" }} />
    </div>
  );
}
