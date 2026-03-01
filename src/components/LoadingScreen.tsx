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
      {/* Radar logo with spinning sweep */}
      <div
        className="relative"
        style={{
          width: 160,
          height: 160,
          animation: exiting
            ? "logoExpand 0.8s ease-out forwards"
            : undefined,
        }}
      >
        <svg viewBox="0 0 256 256" width="160" height="160">
          <defs>
            <radialGradient id="ldBg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0a1628" />
              <stop offset="100%" stopColor="#010108" />
            </radialGradient>
            <linearGradient id="ldSweep" x1="50%" y1="50%" x2="85%" y2="15%">
              <stop offset="0%" stopColor="#00ffff" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#00ffff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="ldPlane" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00ffff" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>

          {/* Background circle */}
          <circle cx="128" cy="128" r="124" fill="url(#ldBg)" stroke="#00ffff" strokeOpacity="0.3" strokeWidth="3" />

          {/* Radar rings */}
          <circle cx="128" cy="128" r="96" fill="none" stroke="#00ffff" strokeOpacity="0.08" strokeWidth="2" />
          <circle cx="128" cy="128" r="64" fill="none" stroke="#00ffff" strokeOpacity="0.12" strokeWidth="2" />
          <circle cx="128" cy="128" r="32" fill="none" stroke="#00ffff" strokeOpacity="0.15" strokeWidth="2" />

          {/* Crosshair lines */}
          <line x1="128" y1="32" x2="128" y2="224" stroke="#00ffff" strokeOpacity="0.06" strokeWidth="1.5" />
          <line x1="32" y1="128" x2="224" y2="128" stroke="#00ffff" strokeOpacity="0.06" strokeWidth="1.5" />

          {/* Spinning radar sweep cone */}
          <g style={{ transformOrigin: "128px 128px", animation: "radarSpin 2s linear infinite" }}>
            <path d="M128,128 L200,56 A104,104 0 0,1 224,112 Z" fill="url(#ldSweep)" opacity="0.5" />
          </g>

          {/* Plane icon */}
          <g transform="translate(128,122) rotate(-45) scale(3.8)">
            <path d="M0,-14 L3,-4 L12,4 L12,6 L3,3 L1,12 L4,14 L4,16 L0,14.5 L-4,16 L-4,14 L-1,12 L-3,3 L-12,6 L-12,4 L-3,-4 Z" fill="url(#ldPlane)" />
          </g>

          {/* Center dot */}
          <circle cx="128" cy="128" r="4" fill="#00ffff" opacity="0.7" />

          {/* Blip dots — fade in/out */}
          <circle cx="72" cy="64" r="4" fill="#00ffff" style={{ animation: "blipPulse 2s ease-in-out infinite 0.3s" }} />
          <circle cx="188" cy="172" r="3.5" fill="#00ffff" style={{ animation: "blipPulse 2s ease-in-out infinite 1.0s" }} />
          <circle cx="52" cy="164" r="3" fill="#00ffff" style={{ animation: "blipPulse 2s ease-in-out infinite 1.7s" }} />
        </svg>

        {/* Outer glow ring (pulsing) */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow: "0 0 40px rgba(0,255,255,0.15), 0 0 80px rgba(0,255,255,0.05)",
            animation: "logoPulse 2s ease-in-out infinite",
          }}
        />
      </div>

      {/* Status text */}
      <div
        className="absolute font-mono text-[11px] tracking-[0.25em] uppercase"
        style={{
          top: "calc(50% + 100px)",
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
          top: "calc(50% + 120px)",
          left: "50%",
          transform: "translateX(-50%)",
          opacity: exiting ? 0 : 1,
          transition: "opacity 0.3s",
          whiteSpace: "nowrap",
        }}
      >
        FLIGHTORBIT v2.0
      </div>
    </div>
  );
}
