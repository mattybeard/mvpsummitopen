const MINUTE = 60_000;
export const DAY = 86_400_000;

const partsCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let f = partsCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(zone, f);
  }
  return f;
}

function wallParts(at: number, zone: string) {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(zone).formatToParts(at)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Minutes the zone is ahead of UTC at the given instant. */
export function offsetMinutes(zone: string, at: number): number {
  const p = wallParts(at, zone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(at / 1000) * 1000) / MINUTE);
}

/** Converts a wall-clock date ("YYYY-MM-DD") and time ("HH:MM") in a zone to a UTC instant. */
export function wallTimeToUtc(date: string, time: string, zone: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const first = naive - offsetMinutes(zone, naive) * MINUTE;
  // A second pass corrects guesses that land near a DST change.
  const second = naive - offsetMinutes(zone, first) * MINUTE;
  return second;
}

/** "YYYY-MM-DD" for the calendar day the instant falls on in the zone. */
export function dayKey(at: number, zone: string): string {
  const p = wallParts(at, zone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function weekday(key: string): number {
  return new Date(`${key}T12:00:00Z`).getUTCDay();
}

export function midnight(key: string, zone: string): number {
  return wallTimeToUtc(key, '00:00', zone);
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(zone: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = zone + JSON.stringify(opts);
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, ...opts });
    fmtCache.set(k, f);
  }
  return f;
}

export const formatDay = (at: number, zone: string) =>
  fmt(zone, { weekday: 'short', day: 'numeric', month: 'short' }).format(at);

export const formatLongDay = (at: number, zone: string) =>
  fmt(zone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(at);

export const formatClock = (at: number, zone: string) =>
  fmt(zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);

export const formatZoneAbbr = (at: number, zone: string) =>
  fmt(zone, { timeZoneName: 'short' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? '';

export const formatFull = (at: number, zone: string) =>
  `${formatDay(at, zone)}, ${formatClock(at, zone)} ${formatZoneAbbr(at, zone)}`;

export function formatOffset(zone: string, at = Date.now()): string {
  const off = offsetMinutes(zone, at);
  const sign = off < 0 ? '−' : '+';
  const abs = Math.abs(off);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function zoneCity(zone: string): string {
  if (zone === 'UTC') return 'UTC';
  return zone.split('/').pop()!.replace(/_/g, ' ');
}

export function allZones(): string[] {
  const zones = Intl.supportedValuesOf?.('timeZone') ?? [];
  return zones.includes('UTC') ? zones : ['UTC', ...zones];
}

export function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function formatDistance(ms: number): string {
  const abs = Math.abs(ms);
  const d = Math.floor(abs / DAY);
  const h = Math.floor((abs % DAY) / 3_600_000);
  const m = Math.round((abs % 3_600_000) / MINUTE);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
