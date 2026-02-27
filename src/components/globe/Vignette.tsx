"use client";

export default function Vignette() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1]"
      style={{
        background:
          "radial-gradient(ellipse 70% 70% at 50% 50%, transparent 0%, rgba(1,1,8,0.4) 60%, rgba(1,1,8,0.85) 100%)",
      }}
    />
  );
}
