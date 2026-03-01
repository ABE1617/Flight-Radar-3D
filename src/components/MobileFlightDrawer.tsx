"use client";

import type { FlightData } from "@/types/flights";
import { FlightRow } from "@/components/FlightPanel";

interface MobileFlightDrawerProps {
  open: boolean;
  onClose: () => void;
  flights: FlightData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onZoom: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}

export default function MobileFlightDrawer({
  open,
  onClose,
  flights,
  selectedId,
  onSelect,
  onZoom,
  search,
  onSearchChange,
}: MobileFlightDrawerProps) {
  const capped = flights.slice(0, 200);

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <div className={`sm:hidden ${open ? "" : "pointer-events-none"}`}>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ zIndex: 24 }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`fixed top-0 bottom-0 left-0 w-[280px] flex flex-col bg-black/85 backdrop-blur-xl border-r border-white/10 transition-transform duration-300 ${
          open ? "translate-x-0 pointer-events-auto" : "-translate-x-full pointer-events-none"
        }`}
        style={{
          zIndex: 25,
          paddingTop: "calc(48px + env(safe-area-inset-top, 0px))",
        }}
      >
        {/* Drawer header */}
        <div className="px-4 py-3 border-b border-white/10">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">
            Flight List
          </span>
          <div className="text-[10px] text-white/25 mt-0.5">
            {capped.length} shown
          </div>
        </div>

        {/* Search bar */}
        <div className="px-3 py-2 border-b border-white/10">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search callsign..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-md pl-8 pr-8 py-2 text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-cyan-500/50 focus:shadow-[0_0_8px_rgba(0,255,255,0.12)] transition-all"
            />
            {search && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors p-1"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Flight list */}
        <div className="flex-1 overflow-y-auto flight-scrollbar">
          {capped.map((f) => (
            <FlightRow
              key={f.id}
              flight={f}
              isSelected={f.id === selectedId}
              onSelect={handleSelect}
              onZoom={onZoom}
            />
          ))}
          {capped.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-white/20">
              No flights found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
