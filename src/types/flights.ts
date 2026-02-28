export interface FlightData {
  id: string;        // ICAO 24-bit address
  lat: number;
  lng: number;
  alt: number;       // geometric altitude in meters
  vel: number;       // ground speed in m/s
  hdg: number;       // true track in degrees
  vr: number;        // vertical rate in m/s
  cs: string;        // callsign
  origin: string;    // origin country
  squawk: string;    // transponder squawk code
  cat: number;       // aircraft category (0-17)
  lastContact: number; // unix timestamp of last contact
  baroAlt: number;   // barometric altitude in meters
  spi: boolean;      // special purpose indicator
}

export interface FlightsResponse {
  flights: FlightData[];
  timestamp: number;
  cached: boolean;
  stale: boolean;
  error: boolean;
}

export interface RouteAirport {
  iata: string;
  icao: string;
  name: string;
  location: string;   // city/region
  lat: number;
  lon: number;
}

export interface RouteInfo {
  departure: RouteAirport | null;
  destination: RouteAirport | null;
  stops?: RouteAirport[];
}

export type ConnectionStatus = "live" | "cached" | "stale" | "error" | "loading";

export interface AircraftMeta {
  registration: string;
  manufacturerName: string;
  model: string;
  typecode: string;
  serialNumber: string;
  owner: string;
  operator: string;
  operatorCallsign: string;
  operatorIcao: string;
  built: string;
  categoryDescription: string;
}
