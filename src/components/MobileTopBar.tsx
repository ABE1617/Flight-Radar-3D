"use client";

import type { ConnectionStatus } from "@/types/flights";
import { STATUS_CONFIG, useAnimatedCount } from "@/components/FlightPanel";

interface MobileTopBarProps {
  menuOpen: boolean;
  onToggleMenu: () => void;
  status: ConnectionStatus;
  flightCount: number;
}

export default function MobileTopBar({
  menuOpen,
  onToggleMenu,
  status,
  flightCount,
}: MobileTopBarProps) {
  const { color } = STATUS_CONFIG[status];
  const animatedCount = useAnimatedCount(flightCount);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-30 sm:hidden flex items-center gap-2 px-3 bg-black/70 backdrop-blur-md border-b border-white/10"
      style={{
        height: "calc(48px + env(safe-area-inset-top, 0px))",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Hamburger / X button */}
      <button
        onClick={onToggleMenu}
        className="w-9 h-9 flex items-center justify-center text-white/60 hover:text-white/90 transition-colors shrink-0"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
      >
        <div className="relative w-5 h-5">
          <span
            className="absolute left-0 w-5 h-[1.5px] bg-current transition-all duration-300 origin-center"
            style={{
              top: menuOpen ? "9.5px" : "4px",
              transform: menuOpen ? "rotate(45deg)" : "rotate(0)",
            }}
          />
          <span
            className="absolute left-0 top-[9.5px] w-5 h-[1.5px] bg-current transition-opacity duration-200"
            style={{ opacity: menuOpen ? 0 : 1 }}
          />
          <span
            className="absolute left-0 w-5 h-[1.5px] bg-current transition-all duration-300 origin-center"
            style={{
              top: menuOpen ? "9.5px" : "15px",
              transform: menuOpen ? "rotate(-45deg)" : "rotate(0)",
            }}
          />
        </div>
      </button>

      {/* Center: app title */}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-bold tracking-[0.2em] text-white/50 uppercase">
          FlightOrbit
        </span>
      </div>

      {/* Right: count + status */}
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="text-[10px] font-bold text-white/60 tabular-nums font-mono">
          {animatedCount}
        </span>
        <div className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
      </div>
    </div>
  );
}
