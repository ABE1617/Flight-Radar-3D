import { NextResponse } from 'next/server';
import type { FlightData, FlightsResponse } from '@/types/flights';

let cachedData: { flights: FlightData[]; timestamp: number } | null = null;

const CACHE_TTL = 15_000; // 15s

export async function GET() {
  const now = Date.now();

  if (cachedData && now - cachedData.timestamp < CACHE_TTL) {
    return NextResponse.json({
      flights: cachedData.flights,
      timestamp: cachedData.timestamp,
      cached: true,
      stale: false,
      error: false,
    } satisfies FlightsResponse);
  }

  // Try adsb.lol first (no rate limits, good coverage)
  const flights = await fetchAdsbLol() ?? await fetchOpenSky();

  if (flights) {
    cachedData = { flights, timestamp: now };
    return NextResponse.json({
      flights,
      timestamp: now,
      cached: false,
      stale: false,
      error: false,
    } satisfies FlightsResponse);
  }

  // Both failed — return stale cache if available
  if (cachedData) {
    return NextResponse.json({
      flights: cachedData.flights,
      timestamp: cachedData.timestamp,
      cached: true,
      stale: true,
      error: true,
    } satisfies FlightsResponse);
  }

  return NextResponse.json({
    flights: [],
    timestamp: now,
    cached: false,
    stale: false,
    error: true,
  } satisfies FlightsResponse);
}

async function fetchAdsbLol(): Promise<FlightData[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    // Large radius from center of world — gets global coverage
    const res = await fetch('https://api.adsb.lol/v2/lat/30/lon/0/dist/20000', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const json = await res.json();
    const ac: Record<string, unknown>[] = json.ac ?? [];

    const flights: FlightData[] = [];
    for (const a of ac) {
      const lat = a.lat as number | undefined;
      const lon = a.lon as number | undefined;
      const gs = a.gs as number | undefined;
      const track = a.track as number | undefined;
      const altBaro = a.alt_baro;

      // Skip ground, missing position, or missing velocity
      if (altBaro === 'ground' || lat == null || lon == null || gs == null || track == null) continue;

      const altGeom = typeof a.alt_geom === 'number' ? a.alt_geom * 0.3048 : 0; // ft to m
      const baroAlt = typeof altBaro === 'number' ? altBaro * 0.3048 : 0; // ft to m
      const baroRate = typeof a.baro_rate === 'number' ? (a.baro_rate as number) * 0.00508 : 0; // ft/min to m/s

      flights.push({
        id: (a.hex as string) ?? '',
        lat,
        lng: lon,
        alt: altGeom || baroAlt || 10000,
        vel: gs * 0.5144, // knots to m/s
        hdg: track,
        vr: baroRate,
        cs: ((a.flight as string) ?? '').trim(),
        origin: ((a.r as string) ?? '').trim(), // registration (e.g. N12345, 9V-SGA)
        squawk: ((a.squawk as string) ?? '').trim(),
        cat: categoryToNumber(a.category as string | undefined),
        lastContact: Math.round(Date.now() / 1000 - ((a.seen as number) ?? 0)),
        baroAlt,
        spi: (a.spi as number) === 1,
      });
    }

    // Shuffle so the MAX_INSTANCES cap in FlightLayer gives global coverage
    // instead of clustering in whatever geographic order the API returns
    for (let i = flights.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [flights[i], flights[j]] = [flights[j], flights[i]];
    }

    return flights;
  } catch {
    return null;
  }
}

function categoryToNumber(cat: string | undefined): number {
  if (!cat) return 0;
  // ADS-B category codes: A0-A7 (aircraft), B0-B7 (other), C0-C7 (surface)
  const map: Record<string, number> = {
    A0: 1, A1: 2, A2: 3, A3: 4, A4: 5, A5: 6, A6: 7, A7: 7,
    B0: 0, B1: 9, B2: 10, B3: 11, B4: 12, B5: 0, B6: 13, B7: 14,
    C0: 0, C1: 15, C2: 16, C3: 17,
  };
  return map[cat] ?? 0;
}

async function fetchOpenSky(): Promise<FlightData[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const headers: Record<string, string> = { Accept: 'application/json' };
    const user = process.env.OPENSKY_USER;
    const pass = process.env.OPENSKY_PASS;
    if (user && pass) {
      headers['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    }

    const res = await fetch('https://opensky-network.org/api/states/all', {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const json = await res.json();
    const states: unknown[][] = json.states ?? [];

    const flights: FlightData[] = [];
    for (const s of states) {
      const onGround = s[8] as boolean;
      const lat = s[6] as number | null;
      const lng = s[5] as number | null;
      const vel = s[9] as number | null;
      const hdg = s[10] as number | null;

      if (onGround || lat == null || lng == null || vel == null || hdg == null) continue;

      flights.push({
        id: s[0] as string,
        lat,
        lng,
        alt: (s[13] as number | null) ?? (s[7] as number | null) ?? 10000,
        vel,
        hdg,
        vr: (s[11] as number | null) ?? 0,
        cs: ((s[1] as string | null) ?? '').trim(),
        origin: ((s[2] as string | null) ?? '').trim(),
        squawk: ((s[14] as string | null) ?? '').trim(),
        cat: (s[17] as number | null) ?? 0,
        lastContact: (s[4] as number | null) ?? 0,
        baroAlt: (s[7] as number | null) ?? 0,
        spi: (s[15] as boolean | null) ?? false,
      });
    }

    return flights;
  } catch {
    return null;
  }
}
