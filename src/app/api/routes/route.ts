import { NextResponse } from 'next/server';
import type { RouteInfo, RouteAirport } from '@/types/flights';

// Cache route lookups by callsign — 5 minute TTL
const routeCache = new Map<string, { data: RouteInfo; ts: number }>();
const ROUTE_TTL = 300_000; // 5 minutes

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const callsign = searchParams.get('callsign')?.trim();
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  if (!callsign) {
    return NextResponse.json({ error: 'Missing callsign param' }, { status: 400 });
  }

  // Check cache
  const cached = routeCache.get(callsign);
  if (cached && Date.now() - cached.ts < ROUTE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const body = {
      planes: [
        {
          callsign,
          lat: lat ? parseFloat(lat) : 0,
          lng: lng ? parseFloat(lng) : 0,
        },
      ],
    };

    const res = await fetch('https://api.adsb.lol/api/0/routeset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(emptyRoute());
    }

    const json = await res.json();

    const route = parseRoute(json, callsign);
    routeCache.set(callsign, { data: route, ts: Date.now() });
    return NextResponse.json(route);
  } catch {
    return NextResponse.json(emptyRoute());
  }
}

function parseRoute(json: unknown, callsign: string): RouteInfo {
  // Response is an array of route matches; find the one for our callsign
  const results = json as Array<{
    callsign?: string;
    _airports?: Array<Record<string, unknown>>;
    plausible?: number;
  }>;

  if (!Array.isArray(results) || results.length === 0) {
    return emptyRoute();
  }

  // Pick the matching callsign (or first result if only one was submitted)
  const match =
    results.find((r) => r.callsign?.toUpperCase() === callsign.toUpperCase()) ??
    results[0];

  if (!match?._airports || match._airports.length === 0) {
    return emptyRoute();
  }

  const airports = match._airports.map(toRouteAirport);

  return {
    departure: airports[0] ?? null,
    destination: airports[airports.length - 1] ?? null,
    stops: airports.length > 2 ? airports.slice(1, -1) : undefined,
  };
}

function toRouteAirport(a: Record<string, unknown>): RouteAirport {
  return {
    iata: (a.iata as string) ?? '',
    icao: (a.icao as string) ?? '',
    name: (a.name as string) ?? '',
    location: (a.location as string) ?? (a.city as string) ?? '',
    lat: (a.lat as number) ?? 0,
    lon: (a.lon as number) ?? (a.lng as number) ?? 0,
  };
}

function emptyRoute(): RouteInfo {
  return { departure: null, destination: null };
}
