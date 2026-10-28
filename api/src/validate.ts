import { nameKey, normaliseName } from './nameRules';
export { nameKey, normaliseName } from './nameRules';

const MAX_NAME = 40;
const MAX_AHEAD_MS = 400 * 86_400_000;

export interface NewGuess {
  name: string;
  nameKey: string;
  at: Date;
  zone: string;
}

function isZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Returns the cleaned guess, or a message explaining why it was refused. */
export function parseGuess(body: unknown, now = Date.now()): NewGuess | string {
  if (typeof body !== 'object' || body === null) return 'Send a JSON body with name, at and zone.';
  const { name, at, zone } = body as Record<string, unknown>;

  if (typeof name !== 'string' || !normaliseName(name)) return 'Your name goes on the board, so we need one.';
  const clean = normaliseName(name);
  if (clean.length > MAX_NAME) return `Names can be up to ${MAX_NAME} characters.`;
  if (/[\u0000-\u001f\u007f]/.test(clean)) return 'That name has characters we cannot show.';
  if (/^[=+\-@]/.test(clean)) return 'Names need to start with a letter or number.';

  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return 'Pick both a day and a time.';
  const minute = Math.floor(Date.parse(at) / 60_000) * 60_000;
  if (minute <= now) return 'That moment has already passed. Pick something in the future.';
  if (minute > now + MAX_AHEAD_MS) return 'That is more than a year away. Pick something sooner.';

  if (typeof zone !== 'string' || zone.length > 64 || !isZone(zone)) return 'Pick a time zone from the list.';

  return { name: clean, nameKey: nameKey(clean), at: new Date(minute), zone };
}
