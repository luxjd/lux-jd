"use client";

import { useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const SMOKE_COUNT = 18;

export default function ScrollCar() {
  const containerRef = useRef(null);
  const carRef = useRef(null);
  const glowRef = useRef(null);
  const trailRef = useRef(null);
  const smokeRef = useRef(null);

  // Build smoke particles in the DOM via useEffect (client-only, avoids hydration mismatch)
  useEffect(() => {
    const container = smokeRef.current;
    if (!container || container.children.length > 0) return;

    for (let i = 0; i < SMOKE_COUNT; i++) {
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.borderRadius = "9999px";
      el.style.pointerEvents = "none";
      el.style.opacity = "0";
      el.style.width = `${8 + Math.random() * 20}px`;
      el.style.height = el.style.width;
      el.style.left = `${-(10 + Math.random() * 40)}px`;
      el.style.top = `${-5 + Math.random() * 30}px`;
      el.style.filter = `blur(${3 + Math.random() * 6}px)`;

      const color =
        i % 3 === 0
          ? "rgba(248,113,113,0.3)"
          : i % 3 === 1
          ? "rgba(255,180,100,0.2)"
          : "rgba(200,200,200,0.15)";
      el.style.background = `radial-gradient(circle, ${color} 0%, transparent 70%)`;

      container.appendChild(el);
    }
  }, []);

  // Animate smoke puffs based on scroll velocity
  const emitSmoke = useCallback((velocity) => {
    const container = smokeRef.current;
    if (!container) return;
    const particles = container.children;
    if (!particles.length) return;

    const count = Math.min(Math.ceil(Math.abs(velocity) * 8), 6);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * particles.length);
      const p = particles[idx];
      const drift = -(20 + Math.random() * 60);
      const rise = -(5 + Math.random() * 15);
      const scale = 0.5 + Math.random() * 1.5;

      gsap.killTweensOf(p);
      gsap.set(p, { x: 0, y: 0, scale: 0.3, opacity: 0 });
      gsap.to(p, {
        x: drift,
        y: rise,
        scale: scale,
        opacity: 0.4 + Math.random() * 0.3,
        duration: 0.3,
        ease: "power2.out",
        onComplete: () => {
          gsap.to(p, {
            x: drift * 2.5,
            y: rise * 2,
            scale: scale * 2,
            opacity: 0,
            duration: 0.6 + Math.random() * 0.4,
            ease: "power1.out",
          });
        },
      });
    }
  }, []);

  useEffect(() => {
    if (!carRef.current || !containerRef.current) return;

    const car = carRef.current;
    const glow = glowRef.current;
    const trail = trailRef.current;
    const mm = gsap.matchMedia();

    // --- Entrance animation ---
    gsap.fromTo(
      car,
      { opacity: 0, scale: 0.7, x: "-10vw" },
      {
        opacity: 1,
        scale: 1,
        x: "0vw",
        duration: 1.2,
        ease: "power3.out",
        delay: 0.5,
      }
    );

    // --- Scroll-linked horizontal movement ---
    mm.add(
      {
        isDesktop: "(min-width: 768px)",
        isMobile: "(max-width: 767px)",
      },
      (context) => {
        const { isDesktop } = context.conditions;
        const carWidth = isDesktop ? 280 : 150;

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: document.documentElement,
            start: "top top",
            end: "bottom bottom",
            scrub: 1.2,
            onUpdate: (self) => {
              const velocity = self.getVelocity() / 1000;
              if (velocity > 0.3) {
                emitSmoke(velocity);
              }
            },
          },
        });

        tl.to(car, {
          x: () => window.innerWidth - carWidth,
          ease: "none",
        });

        if (glow) {
          gsap.to(glow, {
            x: () => window.innerWidth - carWidth,
            scrollTrigger: {
              trigger: document.documentElement,
              start: "top top",
              end: "bottom bottom",
              scrub: 1.4,
            },
            ease: "none",
          });
        }

        if (trail) {
          gsap.to(trail, {
            scaleX: 1,
            scrollTrigger: {
              trigger: document.documentElement,
              start: "top top",
              end: "bottom bottom",
              scrub: 1.0,
            },
            ease: "none",
          });
        }

        return () => {};
      }
    );

    return () => {
      mm.revert();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, [emitSmoke]);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-0 left-0 w-full z-40 pointer-events-none select-none"
      aria-hidden="true"
    >
      {/* Ambient gradient behind the track */}
      <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent" />

      {/* Track line */}
      <div className="absolute bottom-6 left-0 w-full h-px bg-outline-variant/10" />

      {/* Progress trail */}
      <div
        ref={trailRef}
        className="absolute bottom-6 left-0 w-full h-px origin-left"
        style={{
          transform: "scaleX(0)",
          background:
            "linear-gradient(90deg, transparent, rgba(248,113,113,0.4), rgba(255,138,101,0.3))",
        }}
      />

      {/* Glow under the car */}
      <div
        ref={glowRef}
        className="absolute bottom-4 left-0"
        style={{
          width: 180,
          height: 40,
          background:
            "radial-gradient(ellipse at center, rgba(248,113,113,0.25) 0%, transparent 70%)",
          filter: "blur(12px)",
          transform: "translateX(0)",
        }}
      />

      {/* Car element + smoke */}
      <div
        ref={carRef}
        className="absolute bottom-3 left-0 will-change-transform"
        style={{ opacity: 0 }}
      >
        {/* Smoke / exhaust particles — created client-side in useEffect */}
        <div
          ref={smokeRef}
          className="absolute left-0 bottom-[10px] md:bottom-[18px] w-[60px] h-[40px]"
        />

        <Image
          src="/lambo-side.png"
          alt="Lamborghini Aventador"
          width={300}
          height={100}
          className="w-[150px] md:w-[280px] h-auto drop-shadow-[0_0_25px_rgba(248,113,113,0.25)] -scale-x-100"
          priority
          draggable={false}
        />
      </div>
    </div>
  );
}
