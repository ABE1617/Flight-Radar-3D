import { NextResponse } from 'next/server';
import type { AircraftMeta } from '@/types/flights';

// Cache aircraft metadata — rarely changes
const metaCache = new Map<string, { data: AircraftMeta; ts: number }>();
const META_TTL = 3600_000; // 1 hour

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const icao = searchParams.get('icao')?.toLowerCase().trim();

  if (!icao) {
    return NextResponse.json({ error: 'Missing icao param' }, { status: 400 });
  }

  // Check cache
  const cached = metaCache.get(icao);
  if (cached && Date.now() - cached.ts < META_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    // OpenSky metadata endpoint (public, no auth needed)
    const res = await fetch(
      `https://opensky-network.org/api/metadata/aircraft/icao/${icao}`,
      { signal: controller.signal, headers: { Accept: 'application/json' } },
    );
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(emptyMeta());
    }

    const j = await res.json();

    const meta: AircraftMeta = {
      registration: j.registration ?? '',
      manufacturerName: j.manufacturerName ?? '',
      model: j.model ?? '',
      typecode: j.typecode ?? '',
      serialNumber: j.serialNumber ?? '',
      owner: j.owner ?? '',
      operator: j.operatorName ?? j.operator ?? '',
      operatorCallsign: j.operatorCallsign ?? '',
      operatorIcao: j.operatorIcao ?? '',
      built: j.built ?? '',
      categoryDescription: j.categoryDescription ?? '',
    };

    metaCache.set(icao, { data: meta, ts: Date.now() });
    return NextResponse.json(meta);
  } catch {
    return NextResponse.json(emptyMeta());
  }
}

function emptyMeta(): AircraftMeta {
  return {
    registration: '',
    manufacturerName: '',
    model: '',
    typecode: '',
    serialNumber: '',
    owner: '',
    operator: '',
    operatorCallsign: '',
    operatorIcao: '',
    built: '',
    categoryDescription: '',
  };
}
