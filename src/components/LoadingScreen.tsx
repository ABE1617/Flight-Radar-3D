"use client";

import { useEffect, useState, useRef } from "react";

interface LoadingScreenProps {
  ready: boolean;
  onComplete: () => void;
}

const STATUS_STEPS = [
  "INITIALIZING",
  "MAPPING GLOBAL NETWORK",
  "SYNCHRONIZING TELEMETRY",
  "ONLINE",
];

export default function LoadingScreen({ ready, onComplete }: LoadingScreenProps) {
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);
  const minTimeRef = useRef(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  // Cycle status text
  useEffect(() => {
    const intervals = [800, 900, 600];
    let i = 0;
    const advance = () => {
      i++;
      if (i < STATUS_STEPS.length) {
        setStep(i);
        if (i < intervals.length) {
          setTimeout(advance, intervals[i]);
        }
      }
    };
    setTimeout(advance, intervals[0]);
  }, []);

  // Minimum display time
  useEffect(() => {
    const timer = setTimeout(() => {
      minTimeRef.current = true;
      if (readyRef.current) {
        setExiting(true);
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // When ready + min time elapsed, begin exit
  useEffect(() => {
    if (ready && minTimeRef.current && !exiting) {
      setExiting(true);
    }
  }, [ready, exiting]);

  // After exit animation, unmount
  useEffect(() => {
    if (exiting) {
      const timer = setTimeout(onComplete, 800);
      return () => clearTimeout(timer);
    }
  }, [exiting, onComplete]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "#010108",
        opacity: exiting ? 0 : 1,
        transition: "opacity 0.8s ease-out",
      }}
    >
      {/* Grid background — concentric circles + angular lines */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            radial-gradient(circle, transparent 18%, rgba(0,255,255,0.15) 18.5%, transparent 19%),
            radial-gradient(circle, transparent 30%, rgba(0,255,255,0.1) 30.5%, transparent 31%),
            radial-gradient(circle, transparent 44%, rgba(0,255,255,0.08) 44.5%, transparent 45%),
            conic-gradient(from 0deg, transparent 0deg, rgba(0,255,255,0.08) 1deg, transparent 2deg,
              transparent 30deg, rgba(0,255,255,0.06) 31deg, transparent 32deg,
              transparent 60deg, rgba(0,255,255,0.06) 61deg, transparent 62deg,
              transparent 90deg, rgba(0,255,255,0.08) 91deg, transparent 92deg,
              transparent 120deg, rgba(0,255,255,0.06) 121deg, transparent 122deg,
              transparent 150deg, rgba(0,255,255,0.06) 151deg, transparent 152deg,
              transparent 180deg, rgba(0,255,255,0.08) 181deg, transparent 182deg,
              transparent 210deg, rgba(0,255,255,0.06) 211deg, transparent 212deg,
              transparent 240deg, rgba(0,255,255,0.06) 241deg, transparent 242deg,
              transparent 270deg, rgba(0,255,255,0.08) 271deg, transparent 272deg,
              transparent 300deg, rgba(0,255,255,0.06) 301deg, transparent 302deg,
              transparent 330deg, rgba(0,255,255,0.06) 331deg, transparent 332deg,
              transparent 360deg)
          `,
          backgroundPosition: "center center",
          backgroundSize: "100% 100%",
        }}
      />

      {/* Scan line */}
      <div
        className="absolute left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(0,255,255,0.3) 20%, rgba(0,255,255,0.6) 50%, rgba(0,255,255,0.3) 80%, transparent 100%)",
          animation: "scanLine 3s linear infinite",
        }}
      />

      {/* Ring */}
      <div
        className="absolute"
        style={{
          width: 120,
          height: 120,
          left: "50%",
          top: "50%",
          borderRadius: "50%",
          border: "1px solid rgba(0,255,255,0.6)",
          boxShadow: "0 0 30px rgba(0,255,255,0.15), inset 0 0 30px rgba(0,255,255,0.05)",
          animation: exiting
            ? "loadingRingExpand 0.8s ease-out forwards"
            : "loadingRingPulse 2s ease-in-out infinite",
        }}
      />

      {/* Inner ring */}
      <div
        className="absolute"
        style={{
          width: 80,
          height: 80,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: "1px solid rgba(0,255,255,0.2)",
          opacity: exiting ? 0 : 1,
          transition: "opacity 0.3s",
        }}
      />

      {/* Status text */}
      <div
        className="absolute font-mono text-[11px] tracking-[0.25em] uppercase"
        style={{
          top: "calc(50% + 80px)",
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(0,255,255,0.7)",
          animation: "statusPulse 1.5s ease-in-out infinite",
          opacity: exiting ? 0 : 1,
          transition: "opacity 0.3s",
          whiteSpace: "nowrap",
        }}
      >
        {STATUS_STEPS[step]}
      </div>

      {/* Subtitle */}
      <div
        className="absolute font-mono text-[9px] tracking-[0.15em] uppercase text-white/20"
        style={{
          top: "calc(50% + 100px)",
          left: "50%",
          transform: "translateX(-50%)",
          opacity: exiting ? 0 : 1,
          transition: "opacity 0.3s",
          whiteSpace: "nowrap",
        }}
      >
        GLOBAL FLIGHT TRACKER v2.0
      </div>
    </div>
  );
}
