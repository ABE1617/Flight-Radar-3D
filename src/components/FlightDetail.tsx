"use client";

import { useEffect, useState } from "react";
import type { FlightData, AircraftMeta, RouteInfo } from "@/types/flights";

interface FlightDetailProps {
  flight: FlightData;
  onClose: () => void;
  animate?: boolean;
  hidden?: boolean;
}

const CATEGORY_LABELS: Record<number, string> = {
  0: "No info",
  1: "No ADS-B category",
  2: "Light (< 15,500 lbs)",
  3: "Small (15,500-75,000 lbs)",
  4: "Large (75,000-300,000 lbs)",
  5: "High vortex large",
  6: "Heavy (> 300,000 lbs)",
  7: "High performance (> 5g, > 400 kt)",
  8: "Rotorcraft",
  9: "Glider / Sailplane",
  10: "Lighter than air",
  11: "Parachutist / Skydiver",
  12: "Ultralight / Hang glider",
  13: "UAV",
  14: "Space vehicle",
  15: "Surface emergency vehicle",
  16: "Surface service vehicle",
  17: "Point obstacle",
};

export default function FlightDetail({ flight, onClose, animate, hidden }: FlightDetailProps) {
  const [meta, setMeta] = useState<AircraftMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Reset to compact when flight changes
  useEffect(() => {
    setExpanded(false);
  }, [flight.id]);

  useEffect(() => {
    let active = true;
    setMeta(null);
    setMetaLoading(true);

    fetch(`/api/aircraft?icao=${flight.id}`)
      .then((r) => r.json())
      .then((data: AircraftMeta) => {
        if (active) setMeta(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setMetaLoading(false);
      });

    return () => {
      active = false;
    };
  }, [flight.id]);

  useEffect(() => {
    if (!flight.cs) {
      setRoute(null);
      return;
    }

    let active = true;
    setRoute(null);
    setRouteLoading(true);

    fetch(`/api/routes?callsign=${encodeURIComponent(flight.cs)}&lat=${flight.lat}&lng=${flight.lng}`)
      .then((r) => r.json())
      .then((data: RouteInfo) => {
        if (active) setRoute(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setRouteLoading(false);
      });

    return () => {
      active = false;
    };
  }, [flight.cs, flight.lat, flight.lng]);

  const phase =
    flight.vr > 2 ? "Climbing" : flight.vr < -2 ? "Descending" : "Cruising";
  const phaseColor =
    flight.vr > 2
      ? "text-green-400 bg-green-500/15"
      : flight.vr < -2
        ? "text-orange-400 bg-orange-500/15"
        : "text-cyan-400 bg-cyan-500/15";

  const altFt = Math.round(flight.alt * 3.281);
  const altPct = Math.min(altFt / 45000, 1);
  const cardinal = getCardinal(flight.hdg);
  const lastSeen = flight.lastContact
    ? `${Math.round(Date.now() / 1000 - flight.lastContact)}s ago`
    : "--";

  const vrFpm = Math.round(flight.vr * 196.85);

  return (
    <div
      className={[
        // ── Mobile: bottom sheet ──
        "fixed left-0 right-0 bottom-0 z-20 flex flex-col bg-black/80 backdrop-blur-md rounded-t-2xl",
        "transition-[max-height] duration-300 ease-in-out",
        expanded ? "max-h-[70dvh]" : "max-h-[180px] overflow-hidden",
        // ── Desktop: right sidebar (unchanged) ──
        "sm:z-10 sm:inset-auto sm:top-4 sm:bottom-4 sm:left-auto sm:w-80 sm:max-h-none sm:bg-black/60 sm:border sm:border-white/10 sm:rounded-xl sm:transition-[right] sm:duration-300 sm:rounded-t-xl",
        hidden ? "sm:right-[calc(-20rem-1rem)]" : "sm:right-4",
      ].join(" ")}
      style={{
        paddingBottom: expanded ? "env(safe-area-inset-bottom, 0px)" : undefined,
        touchAction: "auto",
      }}
    >
      {/* ── Mobile drag handle + compact header ── */}
      <div className="sm:hidden shrink-0">
        {/* Tap entire header area to toggle expand/collapse */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded((e) => !e)}
          className="cursor-pointer"
        >
          {/* Drag handle pill */}
          <div className="w-full flex flex-col items-center pt-2.5 pb-1.5">
            <div className="w-10 h-1 rounded-full bg-white/30" />
          </div>

          {/* Compact header: logo, callsign, phase, metrics */}
          <div className="px-4 pb-3 flex items-center gap-3">
            <AirlineLogo icao={meta?.operatorIcao} callsign={flight.cs} size="medium" />
            <div className="flex-1 min-w-0">
              {/* Callsign + phase */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-yellow-400 font-mono truncate">
                  {flight.cs || "Unknown"}
                </span>
                <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${phaseColor}`}>
                  {phase}
                </span>
              </div>
              {/* Key metrics row */}
              <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-white/50">
                <span>
                  <span className="text-white/25">ALT </span>
                  <span className="text-white/70">{altFt.toLocaleString()}ft</span>
                </span>
                <span>
                  <span className="text-white/25">SPD </span>
                  <span className="text-white/70">{Math.round(flight.vel * 1.944)}kt</span>
                </span>
                <span>
                  <span className="text-white/25">HDG </span>
                  <span className="text-white/70">{Math.round(flight.hdg)}°</span>
                </span>
              </div>
            </div>
            {/* Close button — stops propagation so it doesn't toggle expand */}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="text-white/40 hover:text-white/70 transition-colors p-2 -mr-1 -mt-0.5 rounded-full hover:bg-white/10"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Expand/collapse chevron hint */}
        <div className="flex justify-center pb-1">
          <svg
            className={`w-4 h-4 text-white/20 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </div>
      </div>

      {/* ── Desktop hero header (hidden on mobile) ── */}
      <div className="hidden sm:block relative px-4 pt-4 pb-3">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-white/40 hover:text-white/70 transition-colors p-1 rounded hover:bg-white/5 z-10"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex flex-col items-center text-center">
          <AirlineLogo icao={meta?.operatorIcao} callsign={flight.cs} />
          <div className="text-xl font-bold text-yellow-400 tracking-wide">
            {flight.cs || "Unknown"}
          </div>
          <div className="text-[10px] text-white/35 font-mono mt-0.5">
            {flight.id.toUpperCase()}
            {meta?.operator && (
              <> &middot; {meta.operator}</>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${phaseColor}`}>
              {phase}
            </span>
            {flight.squawk && (
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                flight.squawk === "7700" ? "bg-red-500/20 text-red-400" :
                flight.squawk === "7600" ? "bg-orange-500/20 text-orange-400" :
                flight.squawk === "7500" ? "bg-red-500/20 text-red-400" :
                "bg-white/5 text-white/40"
              }`}>
                SQK {flight.squawk}
                {flight.squawk === "7700" && " EMERGENCY"}
                {flight.squawk === "7600" && " RADIO FAIL"}
                {flight.squawk === "7500" && " HIJACK"}
              </span>
            )}
            {flight.spi && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-500/15 text-purple-400">
                SPI
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
      </div>

      {/* Route Banner */}
      <RouteBar route={route} loading={routeLoading} />

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto flight-scrollbar px-4 pb-4 space-y-5">

        {/* Altitude Gauge */}
        <div>
          <SectionTitle>Altitude</SectionTitle>
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-white/80">FL{Math.round(altFt / 100)}</span>
              <span className="text-white/40">{altFt.toLocaleString()} ft</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${altPct * 100}%`,
                  background: "linear-gradient(90deg, rgba(0,255,255,0.4), rgba(0,255,255,0.8))",
                }}
              />
            </div>
            <div className="flex items-center gap-1 text-xs font-mono">
              {flight.vr > 0.5 ? (
                <svg className="w-3 h-3 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              ) : flight.vr < -0.5 ? (
                <svg className="w-3 h-3 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              ) : (
                <svg className="w-3 h-3 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              )}
              <span className={
                flight.vr > 0.5 ? "text-green-400" : flight.vr < -0.5 ? "text-orange-400" : "text-white/40"
              }>
                {vrFpm > 0 ? "+" : ""}{vrFpm.toLocaleString()} ft/min
              </span>
            </div>
            <Row label="Barometric" value={`${Math.round(flight.baroAlt * 3.281).toLocaleString()} ft`} />
          </div>
        </div>

        <GradientDivider />

        {/* Speed & Heading with Mini Compass */}
        <div>
          <SectionTitle>Speed & Heading</SectionTitle>
          <div className="mt-2 flex items-start gap-4">
            <MiniCompass heading={flight.hdg} />
            <div className="flex-1 space-y-1.5 text-xs font-mono">
              <Row label="Ground" value={`${Math.round(flight.vel * 1.944)} kt`} />
              <Row label="km/h" value={`${Math.round(flight.vel * 3.6)}`} />
              <Row label="Heading" value={`${Math.round(flight.hdg)}° ${cardinal}`} />
            </div>
          </div>
        </div>

        <GradientDivider />

        {/* Aircraft Info */}
        <div>
          <SectionTitle>Aircraft</SectionTitle>
          <div className="mt-2 space-y-1.5 text-xs font-mono">
            {metaLoading ? (
              <div className="text-[10px] text-white/25 py-1">Loading...</div>
            ) : meta && (meta.manufacturerName || meta.model) ? (
              <>
                {meta.manufacturerName && <Row label="Make" value={meta.manufacturerName} />}
                {meta.model && <Row label="Model" value={meta.model} />}
                {meta.typecode && <Row label="Type" value={meta.typecode} />}
                {meta.registration && <Row label="Reg" value={meta.registration} />}
                {meta.serialNumber && <Row label="S/N" value={meta.serialNumber} />}
                {meta.built && <Row label="Built" value={meta.built} />}
                {meta.owner && <Row label="Owner" value={meta.owner} />}
              </>
            ) : (
              <div className="text-[10px] text-white/25 py-1">No aircraft data</div>
            )}
            <Row label="Category" value={CATEGORY_LABELS[flight.cat] ?? `Unknown (${flight.cat})`} />
          </div>
        </div>

        {/* Operator */}
        {meta && (meta.operator || meta.operatorCallsign) && (
          <>
            <GradientDivider />
            <div>
              <SectionTitle>Operator</SectionTitle>
              <div className="mt-2 space-y-1.5 text-xs font-mono">
                {meta.operator && <Row label="Airline" value={meta.operator} />}
                {meta.operatorCallsign && <Row label="ICAO Call" value={meta.operatorCallsign} />}
                {meta.operatorIcao && <Row label="ICAO Code" value={meta.operatorIcao} />}
              </div>
            </div>
          </>
        )}

        <GradientDivider />

        {/* Position */}
        <div>
          <SectionTitle>Position</SectionTitle>
          <div className="mt-2 space-y-1.5 text-xs font-mono">
            <Row label="Origin" value={flight.origin || "--"} />
            <Row label="Lat" value={`${flight.lat.toFixed(4)}°`} />
            <Row label="Lng" value={`${flight.lng.toFixed(4)}°`} />
            <Row label="Contact" value={lastSeen} />
          </div>
        </div>

        <GradientDivider />

        {/* Identification */}
        <div>
          <SectionTitle>Identification</SectionTitle>
          <div className="mt-2 space-y-1.5 text-xs font-mono">
            <Row label="ICAO" value={flight.id.toUpperCase()} />
            <Row label="Callsign" value={flight.cs || "--"} />
            <Row label="Squawk" value={flight.squawk || "--"} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-1 h-1 rounded-full bg-cyan-400/60 shrink-0" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">
        {children}
      </span>
    </div>
  );
}

function GradientDivider() {
  return (
    <div className="h-[1px] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "green" | "red";
}) {
  const valColor =
    highlight === "green"
      ? "text-green-400"
      : highlight === "red"
        ? "text-red-400"
        : "text-white/70";
  return (
    <div className="flex justify-between items-start gap-2 py-0.5 rounded hover:bg-white/[0.02] transition-colors -mx-1 px-1">
      <span className="text-white/30 shrink-0">{label}</span>
      <span className={`${valColor} text-right`}>{value}</span>
    </div>
  );
}

/* ─── Airline Logo ───────────────────────────────── */

function AirlineLogo({ icao, callsign, size = "default" }: { icao?: string; callsign?: string; size?: "default" | "medium" | "small" }) {
  const [failed, setFailed] = useState(false);

  const code = icao || (callsign ? callsign.replace(/[0-9]/g, "").slice(0, 3) : "");

  useEffect(() => {
    setFailed(false);
  }, [code]);

  const sizeClass = size === "small" ? "w-6 h-6" : size === "medium" ? "w-8 h-8" : "w-8 h-8 mb-1";
  const imgH = size === "small" ? "h-6" : size === "medium" ? "h-8" : "h-10 mb-1";

  if (!code || failed) {
    return (
      <svg className={`${sizeClass} text-yellow-400 shrink-0`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
      </svg>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`https://www.flightaware.com/images/airline_logos/90p/${code}.png`}
      alt={code}
      className={`${imgH} object-contain drop-shadow-lg shrink-0`}
      onError={() => setFailed(true)}
    />
  );
}

/* ─── Route Bar ──────────────────────────────────── */

function RouteBar({ route, loading }: { route: RouteInfo | null; loading: boolean }) {
  const dep = route?.departure;
  const dest = route?.destination;
  const hasRoute = dep || dest;
  const stops = route?.stops;

  return (
    <div className="px-4 pb-3">
      <div className="flex items-center justify-between gap-2 py-2">
        {/* Departure */}
        <div className="flex-1 text-center min-w-0">
          {loading ? (
            <div className="text-[10px] text-white/20">...</div>
          ) : hasRoute && dep ? (
            <>
              <div className="text-sm font-bold text-white/90 tracking-wide">
                {dep.iata || dep.icao || "--"}
              </div>
              <div className="text-[10px] text-white/35 truncate">
                {dep.location || dep.name || "--"}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-bold text-white/30">--</div>
              <div className="text-[10px] text-white/20">Origin</div>
            </>
          )}
        </div>

        {/* Arrow with optional stops */}
        <div className="flex items-center gap-1 shrink-0 px-1">
          <div className="w-4 h-[1px] bg-white/15" />
          {stops && stops.length > 0 && stops.map((s, i) => (
            <div key={i} className="flex items-center gap-1" title={`${s.iata || s.icao} — ${s.location || s.name}`}>
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400/50" />
              <div className="w-2 h-[1px] bg-white/15" />
            </div>
          ))}
          <svg className="w-4 h-4 text-cyan-400/60" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
          </svg>
          <div className="w-4 h-[1px] bg-white/15" />
        </div>

        {/* Destination */}
        <div className="flex-1 text-center min-w-0">
          {loading ? (
            <div className="text-[10px] text-white/20">...</div>
          ) : hasRoute && dest ? (
            <>
              <div className="text-sm font-bold text-white/90 tracking-wide">
                {dest.iata || dest.icao || "--"}
              </div>
              <div className="text-[10px] text-white/35 truncate">
                {dest.location || dest.name || "--"}
              </div>
            </>
          ) : (
            <>
              <div className="text-sm font-bold text-white/30">--</div>
              <div className="text-[10px] text-white/20">Dest</div>
            </>
          )}
        </div>
      </div>
      <div className="h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
    </div>
  );
}

/* ─── Mini Compass ───────────────────────────────── */

function MiniCompass({ heading }: { heading: number }) {
  const size = 48;
  const c = size / 2;
  const r = 20;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

      {[
        { angle: 0, label: "N" },
        { angle: 90, label: "E" },
        { angle: 180, label: "S" },
        { angle: 270, label: "W" },
      ].map(({ angle, label }) => {
        const rad = ((angle - 90) * Math.PI) / 180;
        const x1 = c + (r - 3) * Math.cos(rad);
        const y1 = c + (r - 3) * Math.sin(rad);
        const x2 = c + (r + 1) * Math.cos(rad);
        const y2 = c + (r + 1) * Math.sin(rad);
        const lx = c + (r - 8) * Math.cos(rad);
        const ly = c + (r - 8) * Math.sin(rad);
        return (
          <g key={angle}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              fill={label === "N" ? "rgba(0,255,255,0.6)" : "rgba(255,255,255,0.15)"}
              fontSize="5"
              fontFamily="monospace"
            >
              {label}
            </text>
          </g>
        );
      })}

      {(() => {
        const rad = ((heading - 90) * Math.PI) / 180;
        const x = c + r * Math.cos(rad);
        const y = c + r * Math.sin(rad);
        return (
          <line
            x1={c}
            y1={c}
            x2={x}
            y2={y}
            stroke="rgba(0,255,255,0.8)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        );
      })()}

      <circle cx={c} cy={c} r="1.5" fill="rgba(0,255,255,0.5)" />
    </svg>
  );
}

function getCardinal(deg: number): string {
  const dirs = [
    "N","NNE","NE","ENE","E","ESE","SE","SSE",
    "S","SSW","SW","WSW","W","WNW","NW","NNW",
  ];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}
