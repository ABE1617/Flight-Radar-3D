"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { GlobeEngine } from "./GlobeEngine";
import FlightPanel from "@/components/FlightPanel";
import FlightDetail from "@/components/FlightDetail";
import LoadingScreen from "@/components/LoadingScreen";
import type { FlightData, FlightsResponse } from "@/types/flights";

type ConnectionStatus = "live" | "cached" | "stale" | "error" | "loading";

/** Must match MAX_INSTANCES in FlightLayer.ts */
const MAX_RENDERED = 6000;

export default function Globe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GlobeEngine | null>(null);

  const [rawFlights, setRawFlights] = useState<FlightData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
    // Globe click = select + zoom in
    engine.setOnFlightClick((id) => {
      selectRef.current(id);
      engine.zoomIn();
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
    if (!search) return flights;
    const q = search.toLowerCase();
    return flights.filter(
      (f) => f.cs.toLowerCase().includes(q) || f.id.toLowerCase().includes(q),
    );
  }, [flights, search]);

  // Single click = select (center camera, show detail, no zoom-in)
  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  // Double click = select + zoom in close
  const handleZoom = useCallback((id: string) => {
    setSelectedId(id);
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

  const showPanels = loadingDone;

  return (
    <>
      <div ref={containerRef} className="fixed inset-0 z-0" />

      {!loadingDone && (
        <LoadingScreen ready={engineReady} onComplete={handleLoadingComplete} />
      )}

      {showPanels && (
        <>
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
          />
          {selectedFlight && (
            <FlightDetail flight={selectedFlight} onClose={handleClose} animate />
          )}
        </>
      )}
    </>
  );
}
