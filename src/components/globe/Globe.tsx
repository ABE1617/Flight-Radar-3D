"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { GlobeEngine } from "./GlobeEngine";
import FlightPanel from "@/components/FlightPanel";
import FlightDetail from "@/components/FlightDetail";
import MobileTopBar from "@/components/MobileTopBar";
import MobileFlightDrawer from "@/components/MobileFlightDrawer";
import LoadingScreen from "@/components/LoadingScreen";
import type { FlightData, FlightsResponse, ConnectionStatus } from "@/types/flights";

/** Must match MAX_INSTANCES in FlightLayer.ts */
const MAX_RENDERED = 6000;

export default function Globe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GlobeEngine | null>(null);

  const [rawFlights, setRawFlights] = useState<FlightData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [leftHidden, setLeftHidden] = useState(false);
  const [rightHidden, setRightHidden] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [engineReady, setEngineReady] = useState(false);
  const [loadingDone, setLoadingDone] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("loading");

  // Cap to what the globe actually renders — keeps list and 3D in sync
  const flights = useMemo(() => rawFlights.slice(0, MAX_RENDERED), [rawFlights]);

  // Stable callback refs for engine callbacks
  const selectRef = useRef(setSelectedId);
  selectRef.current = setSelectedId;
  const engineRefStable = engineRef;

  // Initialize engine
  useEffect(() => {
    if (!containerRef.current || engineRef.current) return;
    const engine = new GlobeEngine(containerRef.current);
    // Globe click = select + zoom in, or deselect when clicking empty space
    engine.setOnFlightClick((id) => {
      selectRef.current(id);
      if (id) engine.zoomIn();
    });
    engine.setOnReady(() => setEngineReady(true));
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Poll flights every 10s
  useEffect(() => {
    let active = true;

    const fetchFlights = async () => {
      try {
        const res = await fetch("/api/flights");
        if (!res.ok) {
          if (active) setConnectionStatus("error");
          return;
        }
        const data: FlightsResponse = await res.json();
        if (active) {
          setRawFlights(data.flights);
          if (data.error) setConnectionStatus("error");
          else if (data.stale) setConnectionStatus("stale");
          else if (data.cached) setConnectionStatus("cached");
          else setConnectionStatus("live");
        }
      } catch {
        if (active) setConnectionStatus("error");
      }
    };

    fetchFlights();
    const id = setInterval(fetchFlights, 10_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Push flights to engine (capped set)
  useEffect(() => {
    engineRef.current?.setFlights(flights);
  }, [flights]);

  // Auto-deselect when selected flight disappears
  useEffect(() => {
    if (selectedId && !flights.find((f) => f.id === selectedId)) {
      setSelectedId(null);
    }
  }, [flights, selectedId]);

  const selectedFlight = useMemo(
    () => flights.find((f) => f.id === selectedId) ?? null,
    [flights, selectedId],
  );

  // Always track (center camera on) the selected flight
  useEffect(() => {
    engineRef.current?.setSelectedFlight(selectedFlight);
  }, [selectedFlight]);

  // Filter flights by search
  const filtered = useMemo(() => {
    if (!search || !search.trim()) return flights;
    const q = search.trim().toLowerCase();
    return flights.filter(
      (f) => f.cs.toLowerCase().includes(q) || f.id.toLowerCase().includes(q),
    );
  }, [flights, search]);

  // Single click = select (center camera, show detail, no zoom-in)
  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) {
      setRightHidden(false);
      setMobileMenuOpen(false); // auto-close drawer on mobile
    }
  }, []);

  // Double click = select + zoom in close
  const handleZoom = useCallback((id: string) => {
    setSelectedId(id);
    setMobileMenuOpen(false);
    engineRefStable.current?.zoomIn();
  }, [engineRefStable]);

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedId(null);
  }, []);

  const handleLoadingComplete = useCallback(() => {
    setLoadingDone(true);
  }, []);

  const handleToggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((o) => !o);
  }, []);

  const handleCloseMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const showPanels = loadingDone;

  return (
    <>
      <div ref={containerRef} className="fixed inset-0 z-0" />

      {!loadingDone && (
        <LoadingScreen ready={engineReady} onComplete={handleLoadingComplete} />
      )}

      {showPanels && (
        <>
          {/* ── Mobile components ── */}
          <MobileTopBar
            menuOpen={mobileMenuOpen}
            onToggleMenu={handleToggleMobileMenu}
            search={search}
            onSearchChange={handleSearchChange}
            status={connectionStatus}
            flightCount={rawFlights.length}
          />
          <MobileFlightDrawer
            open={mobileMenuOpen}
            onClose={handleCloseMobileMenu}
            flights={filtered}
            selectedId={selectedId}
            onSelect={handleSelect}
            onZoom={handleZoom}
          />

          {/* ── Desktop flight panel (hidden on mobile) ── */}
          <FlightPanel
            flights={filtered}
            totalCount={rawFlights.length}
            selectedId={selectedId}
            search={search}
            onSearchChange={handleSearchChange}
            onSelect={handleSelect}
            onZoom={handleZoom}
            status={connectionStatus}
            animate
            hidden={leftHidden}
          />
          {/* Left panel toggle (desktop only) */}
          <button
            onClick={() => setLeftHidden((h) => !h)}
            className={[
              "hidden sm:flex fixed z-20 top-1/2 -translate-y-1/2 items-center justify-center",
              "w-5 h-10 bg-black/50 backdrop-blur-sm border border-white/10 rounded-r-md",
              "text-white/40 hover:text-white/70 hover:bg-black/70 transition-[left] duration-300",
              leftHidden ? "left-0" : "left-[304px]",
            ].join(" ")}
            title={leftHidden ? "Show flight list" : "Hide flight list"}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {leftHidden
                ? <polyline points="9 18 15 12 9 6" />
                : <polyline points="15 18 9 12 15 6" />
              }
            </svg>
          </button>

          {selectedFlight && (
            <>
              <FlightDetail flight={selectedFlight} onClose={handleClose} animate hidden={rightHidden} />
              {/* Right panel toggle (desktop only) */}
              <button
                onClick={() => setRightHidden((h) => !h)}
                className={[
                  "hidden sm:flex fixed z-20 top-1/2 -translate-y-1/2 items-center justify-center",
                  "w-5 h-10 bg-black/50 backdrop-blur-sm border border-white/10 rounded-l-md",
                  "text-white/40 hover:text-white/70 hover:bg-black/70 transition-[right] duration-300",
                  rightHidden ? "right-0" : "right-[336px]",
                ].join(" ")}
                title={rightHidden ? "Show flight detail" : "Hide flight detail"}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {rightHidden
                    ? <polyline points="15 18 9 12 15 6" />
                    : <polyline points="9 18 15 12 9 6" />
                  }
                </svg>
              </button>
            </>
          )}
        </>
      )}
    </>
  );
}
