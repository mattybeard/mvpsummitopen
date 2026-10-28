export interface Guess {
  id: string;
  name: string;
  /** Guessed opening time, UTC epoch ms. */
  at: number;
  /** IANA zone the guesser entered their time in. */
  zone: string;
  /** When the guess was placed, UTC epoch ms. Earlier wins a tie. */
  placedAt: number;
  /** True when this browser placed the guess and can remove it. */
  mine: boolean;
}

interface ApiGuess {
  id: string;
  name: string;
  at: string;
  zone: string;
  placedAt: string;
}

const API = '/api/guesses';
const TOKENS_KEY = 'mvp-summit-guess:tokens';

export class ApiError extends Error {}

function readTokens(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeTokens(tokens: Record<string, string>) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

function fromApi(g: ApiGuess, tokens = readTokens()): Guess {
  return {
    id: g.id,
    name: g.name,
    at: Date.parse(g.at),
    zone: g.zone,
    placedAt: Date.parse(g.placedAt),
    mine: g.id in tokens,
  };
}

async function request(input: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, { cache: 'no-store', ...init });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error ?? `The server said no (${res.status}).`);
  }
  return res;
}

export async function fetchGuesses(): Promise<Guess[]> {
  const rows: ApiGuess[] = await (await request(API)).json();
  const tokens = readTokens();
  // Forget tokens for guesses that no longer exist.
  const ids = new Set(rows.map((r) => r.id));
  const kept = Object.fromEntries(Object.entries(tokens).filter(([id]) => ids.has(id)));
  if (Object.keys(kept).length !== Object.keys(tokens).length) writeTokens(kept);
  return rows.map((r) => fromApi(r, kept));
}

export async function submitGuess(input: { name: string; at: number; zone: string }): Promise<Guess> {
  const res = await request(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.name, at: new Date(input.at).toISOString(), zone: input.zone }),
  });
  const { token, ...guess }: ApiGuess & { token: string } = await res.json();
  writeTokens({ ...readTokens(), [guess.id]: token });
  return fromApi(guess);
}

export async function removeGuess(id: string): Promise<void> {
  const tokens = readTokens();
  const token = tokens[id];
  if (!token) throw new ApiError('Only the browser that placed a guess can remove it.');
  await request(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-guess-token': token } });
  delete tokens[id];
  writeTokens(tokens);
}

const HEADER = ['name', 'guess_utc', 'timezone', 'submitted_utc'];
// A leading ' stops Excel and similar apps treating a value as a formula.
const defuse = (v: string) => (/^[\s\u0000-\u001f]*[=+\-@]/.test(v) ? `'${v}` : v);
const csvField = (v: string) => {
  const safe = defuse(v);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(guesses: Guess[]): string {
  const lines = [HEADER.join(',')];
  for (const g of [...guesses].sort((a, b) => a.placedAt - b.placedAt)) {
    lines.push(
      [g.name, new Date(g.at).toISOString(), g.zone, new Date(g.placedAt).toISOString()].map(csvField).join(','),
    );
  }
  return lines.join('\n') + '\n';
}
