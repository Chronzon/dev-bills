"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Point = {
  x: number;
  y: number;
};

export function DottedSurface() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetRef = useRef<Point>({ x: 0, y: 0 });
  const currentRef = useRef<Point>({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);

  const dots = useMemo(
    () =>
      Array.from({ length: 620 }, (_, index) => ({
        seed: index * 19.37,
        x: ((index * 73) % 1000) / 1000,
        y: ((index * 41) % 1000) / 1000,
        size: 0.55 + ((index * 11) % 10) / 13,
        drift: 5 + ((index * 29) % 23),
        speed: 0.45 + ((index * 17) % 13) / 18,
        phase: ((index * 97) % 360) * (Math.PI / 180),
      })),
    [],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let animationId = 0;

    const resize = () => {
      const scale = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.floor(width * scale);
      canvas.height = Math.floor(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const styles = getComputedStyle(document.documentElement);
      const dotRgb = styles.getPropertyValue("--dot-rgb").trim() || "247, 247, 242";
      const glowStart =
        Number.parseFloat(styles.getPropertyValue("--dot-glow-start")) || 0.18;
      const glowMid =
        Number.parseFloat(styles.getPropertyValue("--dot-glow-mid")) || 0.08;
      const alphaBase =
        Number.parseFloat(styles.getPropertyValue("--dot-alpha-base")) || 0.12;
      frame += reducedMotion ? 0 : 0.016;

      currentRef.current.x += (targetRef.current.x - currentRef.current.x) * 0.08;
      currentRef.current.y += (targetRef.current.y - currentRef.current.y) * 0.08;

      context.clearRect(0, 0, width, height);

      const glow = context.createRadialGradient(
        width * 0.5 + currentRef.current.x * 90,
        height * 0.5 + currentRef.current.y * 70,
        Math.max(18, Math.min(width, height) * 0.03),
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.42,
      );
      glow.addColorStop(0, `rgba(${dotRgb},${glowStart})`);
      glow.addColorStop(0.28, `rgba(${dotRgb},${glowMid})`);
      glow.addColorStop(1, `rgba(${dotRgb},0)`);
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      for (const dot of dots) {
        const driftX =
          Math.sin(frame * dot.speed + dot.phase) *
          dot.drift *
          (0.45 + dot.y * 0.8);
        const driftY =
          Math.cos(frame * (dot.speed * 0.72) + dot.seed) *
          dot.drift *
          (0.35 + dot.x * 0.55);
        const px = dot.x * width + (reducedMotion ? 0 : driftX);
        const py = dot.y * height + (reducedMotion ? 0 : driftY);
        const distanceFromCenter = Math.hypot(px - width * 0.5, py - height * 0.5);
        const lightInfluence = Math.max(
          0,
          1 - distanceFromCenter / (Math.max(width, height) * 0.42),
        );
        const x =
          px +
          currentRef.current.x * 34 * (0.35 + dot.y) +
          Math.sin(frame + dot.seed) * (reducedMotion ? 0 : 2.4);
        const y =
          py +
          currentRef.current.y * 30 * (0.35 + dot.x) +
          Math.cos(frame + dot.seed) * (reducedMotion ? 0 : 2.4);
        const pulse = reducedMotion ? 0 : Math.sin(frame * 1.7 + dot.phase) * 0.18;
        const alpha = alphaBase + lightInfluence * 0.58 + dot.y * 0.08 + pulse * 0.22;
        const size = dot.size + lightInfluence * 1.6 + pulse;

        context.fillStyle = `rgba(${dotRgb},${alpha})`;
        context.fillRect(x, y, size, size);
      }

      animationId = window.requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(animationId);
    };
  }, [dots, reducedMotion]);

  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      targetRef.current = { x, y };
    };

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.gamma == null || event.beta == null) return;
      targetRef.current = {
        x: Math.max(-0.5, Math.min(0.5, event.gamma / 70)),
        y: Math.max(-0.5, Math.min(0.5, event.beta / 90)),
      };
    };

    window.addEventListener("pointermove", handlePointer);
    window.addEventListener("pointerdown", handlePointer);
    window.addEventListener("deviceorientation", handleOrientation);

    return () => {
      window.removeEventListener("pointermove", handlePointer);
      window.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, []);

  return <canvas ref={canvasRef} className="dotted-surface" aria-hidden="true" />;
}
