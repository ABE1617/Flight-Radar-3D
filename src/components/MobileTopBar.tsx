"use client";

import { useRef, useEffect } from "react";
import type { ConnectionStatus } from "@/types/flights";
import { STATUS_CONFIG, useAnimatedCount } from "@/components/FlightPanel";

interface MobileTopBarProps {
  menuOpen: boolean;
  onToggleMenu: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  status: ConnectionStatus;
  flightCount: number;
}

export default function MobileTopBar({
  menuOpen,
  onToggleMenu,
  search,
  onSearchChange,
  status,
  flightCount,
}: MobileTopBarProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const { color } = STATUS_CONFIG[status];
  const animatedCount = useAnimatedCount(flightCount);
  const searchOpen = search.length > 0;

  useEffect(() => {
    if (searchOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [searchOpen]);

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
          {/* Top line */}
          <span
            className="absolute left-0 w-5 h-[1.5px] bg-current transition-all duration-300 origin-center"
            style={{
              top: menuOpen ? "9.5px" : "4px",
              transform: menuOpen ? "rotate(45deg)" : "rotate(0)",
            }}
          />
          {/* Middle line */}
          <span
            className="absolute left-0 top-[9.5px] w-5 h-[1.5px] bg-current transition-opacity duration-200"
            style={{ opacity: menuOpen ? 0 : 1 }}
          />
          {/* Bottom line */}
          <span
            className="absolute left-0 w-5 h-[1.5px] bg-current transition-all duration-300 origin-center"
            style={{
              top: menuOpen ? "9.5px" : "15px",
              transform: menuOpen ? "rotate(-45deg)" : "rotate(0)",
            }}
          />
        </div>
      </button>

      {/* Center: title or search input */}
      <div className="flex-1 min-w-0 flex items-center">
        {searchOpen ? (
          <div className="relative flex-1">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search callsign..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-md pl-3 pr-8 py-1.5 text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-cyan-500/50 transition-all"
            />
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ) : (
          <span className="text-xs font-bold tracking-[0.2em] text-white/50 uppercase">
            Flight Radar
          </span>
        )}
      </div>

      {/* Right: search toggle, count, status */}
      <div className="flex items-center gap-2.5 shrink-0">
        {!searchOpen && (
          <button
            onClick={() => onSearchChange(" ")}
            className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
            aria-label="Search flights"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        )}
        <span className="text-[10px] font-bold text-white/60 tabular-nums font-mono">
          {animatedCount}
        </span>
        <div className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
      </div>
    </div>
  );
}
