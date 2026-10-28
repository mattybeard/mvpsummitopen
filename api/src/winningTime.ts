/** Parses "dd/mm/yyyy hh:mm" (UTC) into epoch ms, or null if missing or invalid. */
export function parseWinningTime(raw: string | undefined): number | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*$/.exec(raw ?? '');
  if (!m) return null;
  const [day, month, year, hour, minute] = m.slice(1).map(Number);
  const ms = Date.UTC(year, month - 1, day, hour, minute);
  const d = new Date(ms);
  const valid =
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day &&
    d.getUTCHours() === hour &&
    d.getUTCMinutes() === minute;
  return valid ? ms : null;
}
