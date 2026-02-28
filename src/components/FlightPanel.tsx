"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { FlightData } from "@/types/flights";

type ConnectionStatus = "live" | "cached" | "stale" | "error" | "loading";

/* ICAO airline code → short display name */
const AIRLINES: Record<string, string> = {
  AAL:"American",AAR:"Asiana",AAY:"Allegiant",ACA:"Air Canada",AFR:"Air France",
  AIC:"Air India",AIJ:"Interjet",ANA:"ANA",ASA:"Alaska",AVA:"Avianca",
  AZA:"Alitalia",AZU:"Azul",BAW:"British Airways",BER:"Berline",CAL:"China Airlines",
  CCA:"Air China",CES:"China Eastern",CMP:"Copa",CPA:"Cathay Pacific",
  CSN:"China Southern",DAL:"Delta",DLH:"Lufthansa",EDV:"Endeavor",EIN:"Aer Lingus",
  EJA:"NetJets",ENY:"Envoy",ETH:"Ethiopian",EVA:"EVA Air",EWG:"Eurowings",
  EZY:"easyJet",FDX:"FedEx",FFT:"Frontier",GAL:"GoAir",GIA:"Garuda",
  GLO:"GOL",GTI:"Atlas Air",HAL:"Hawaiian",IBE:"Iberia",ICE:"Icelandair",
  IGO:"IndiGo",JAL:"Japan Airlines",JBU:"JetBlue",JIA:"PSA Airlines",
  JST:"Jetstar",KAL:"Korean Air",KLM:"KLM",LNI:"Lion Air",MAS:"Malaysia",
  MXY:"Breeze",NKS:"Spirit",PAL:"Philippine",POE:"Porter",QFA:"Qantas",
  QTR:"Qatar Airways",RAM:"Royal Air Maroc",RPA:"Republic",RYR:"Ryanair",
  SAS:"SAS",SIA:"Singapore",SKW:"SkyWest",SWA:"Southwest",SWR:"Swiss",
  TAM:"LATAM",TAP:"TAP Portugal",THA:"Thai Airways",THY:"Turkish",
  TSC:"Air Transat",UAE:"Emirates",UAL:"United",UPS:"UPS",VIR:"Virgin Atlantic",
  VIV:"Viva Aerobus",VOI:"Volaris",VOZ:"Virgin Australia",WJA:"WestJet",
  WZZ:"Wizz Air",
};

function getAirline(callsign: string): string {
  if (!callsign) return "";
  const prefix = callsign.replace(/[0-9]/g, "");
  return AIRLINES[prefix] ?? "";
}

interface FlightPanelProps {
  flights: FlightData[];
  totalCount: number;
  selectedId: string | null;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (id: string | null) => void;
  onZoom: (id: string) => void;
  status: ConnectionStatus;
  animate?: boolean;
  collapsed?: boolean;
}

/* ─── Animated Counter ───────────────────────────── */
function useAnimatedCount(target: number, duration = 500) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    const from = prevRef.current;
    const diff = target - from;
    if (diff === 0) return;

    const start = performance.now();
    let raf: number;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setDisplay(Math.round(from + diff * t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = target;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}

/* ─── Flight Row ─────────────────────────────────── */
const FlightRow = memo(function FlightRow({
  flight,
  isSelected,
  onSelect,
  onZoom,
}: {
  flight: FlightData;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onZoom: (id: string) => void;
}) {
  const altFt = Math.round(flight.alt * 3.281);
  const altPct = Math.min(altFt / 45000, 1);
  const speedKt = Math.round(flight.vel * 1.944);

  return (
    <button
      onClick={() => onSelect(flight.id)}
      onDoubleClick={() => onZoom(flight.id)}
      className={`w-full text-left px-3 py-3 sm:py-2 transition-colors border-b border-white/[0.03] ${
        isSelected
          ? "bg-yellow-500/10 shadow-[inset_0_0_12px_rgba(234,179,8,0.08)]"
          : "hover:bg-white/[0.03] active:bg-white/[0.06]"
      }`}
    >
      {/* Line 1 */}
      <div className="flex items-center gap-2">
        {/* Tiny plane icon */}
        <svg
          className="w-2 h-2 shrink-0 text-white/20"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </svg>
        <span
          className={`text-xs font-mono font-semibold truncate flex-1 ${
            isSelected ? "text-yellow-400" : "text-cyan-400"
          }`}
        >
          {flight.cs || "------"}
        </span>
        <span className="text-[10px] font-mono text-white/40 tabular-nums">
          FL{Math.round(altFt / 100)}
        </span>
        {/* Altitude bar */}
        <div className="w-[2px] h-4 rounded-full bg-white/[0.06] relative overflow-hidden shrink-0">
          <div
            className="absolute bottom-0 left-0 w-full rounded-full bg-cyan-400/60"
            style={{ height: `${altPct * 100}%` }}
          />
        </div>
      </div>
      {/* Line 2 */}
      <div className="flex items-center gap-2 mt-0.5 pl-4">
        <span className="text-[10px] text-white/25 truncate flex-1">
          {getAirline(flight.cs) || flight.origin || flight.id.toUpperCase()}
        </span>
        <span className="text-[10px] font-mono text-white/30 tabular-nums">
          {speedKt}kt
        </span>
        <span className="text-[10px] font-mono text-white/25 tabular-nums w-8 text-right">
          {Math.round(flight.hdg)}°
        </span>
      </div>
    </button>
  );
});

/* ─── Status Bar ─────────────────────────────────── */
const STATUS_CONFIG: Record<ConnectionStatus, { color: string; label: string }> = {
  live:    { color: "bg-green-400", label: "LIVE" },
  cached:  { color: "bg-blue-400",  label: "CACHED" },
  stale:   { color: "bg-yellow-400", label: "STALE DATA" },
  error:   { color: "bg-red-400",   label: "ERROR" },
  loading: { color: "bg-white/40",  label: "CONNECTING" },
};

/* ─── Main Panel ─────────────────────────────────── */
export default function FlightPanel({
  flights,
  totalCount,
  selectedId,
  search,
  onSearchChange,
  onSelect,
  onZoom,
  status,
  animate,
  collapsed,
}: FlightPanelProps) {
  const capped = flights.slice(0, 200);
  const animatedCount = useAnimatedCount(totalCount);
  const { color, label } = STATUS_CONFIG[status];

  return (
    <div
      className={[
        // Mobile: bottom sheet
        "fixed left-0 right-0 bottom-0 z-10 flex flex-col bg-black/70 backdrop-blur-md border-t border-white/10 rounded-t-2xl overflow-hidden transition-transform duration-300",
        collapsed ? "translate-y-full" : "translate-y-0",
        // Mobile height
        "max-h-[45dvh]",
        // Desktop: left sidebar
        "sm:translate-y-0 sm:left-4 sm:right-auto sm:top-4 sm:bottom-4 sm:w-72 sm:max-h-none sm:border sm:border-white/10 sm:rounded-xl sm:border-t",
        // Animation
        animate ? "anim-panel-left" : "",
      ].join(" ")}
    >
      {/* Mobile drag handle */}
      <div className="flex justify-center pt-2 pb-1 sm:hidden">
        <div className="w-10 h-1 rounded-full bg-white/20" />
      </div>

      {/* Header */}
      <div className="px-4 py-2 sm:py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0"
            style={{ animation: "statusPulse 2s ease-in-out infinite" }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/50">
            Live Flights
          </span>
          <span className="text-[10px] font-bold text-white/70 tabular-nums sm:hidden ml-auto">
            {animatedCount}
          </span>
        </div>
        <div className="hidden sm:block text-xl font-bold text-white/90 tabular-nums leading-tight mt-0.5">
          {animatedCount}
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-white/10">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-3 sm:h-3 text-white/30 pointer-events-none"
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
            className="w-full bg-white/5 border border-white/10 rounded-md pl-8 pr-8 py-2 sm:py-1.5 text-sm sm:text-xs text-white/90 placeholder:text-white/25 outline-none focus:border-cyan-500/50 focus:shadow-[0_0_8px_rgba(0,255,255,0.12)] transition-all"
          />
          {search && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors p-1"
            >
              <svg className="w-3.5 h-3.5 sm:w-3 sm:h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
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
            onSelect={onSelect}
            onZoom={onZoom}
          />
        ))}
        {capped.length === 0 && (
          <div className="px-4 py-6 sm:py-8 text-center text-xs text-white/20">
            {search ? "No matching flights" : "No flights"}
          </div>
        )}
      </div>

      {/* Connection status bar */}
      <div className="px-4 py-1.5 sm:py-2 border-t border-white/10 flex items-center gap-2 pb-[env(safe-area-inset-bottom,6px)]">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
        <span className="text-[9px] font-mono uppercase tracking-wider text-white/35">
          {label}
        </span>
      </div>
    </div>
  );
}
