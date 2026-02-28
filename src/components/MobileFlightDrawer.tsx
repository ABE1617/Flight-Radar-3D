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
}

export default function MobileFlightDrawer({
  open,
  onClose,
  flights,
  selectedId,
  onSelect,
  onZoom,
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
