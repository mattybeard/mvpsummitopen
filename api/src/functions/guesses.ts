import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { ConflictError, createGuess, deleteGuess, listGuesses } from '../store';
import { CARL, parseGuess } from '../validate';

const json = (status: number, body: unknown): HttpResponseInit => ({
  status,
  jsonBody: body,
  headers: { 'Cache-Control': 'no-store' },
});
const fail = (status: number, error: string) => json(status, { error });

async function guesses(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    if (req.method === 'GET') return json(200, await listGuesses());

    if (process.env.ENTRIES_CLOSED === 'true') return fail(403, 'Guessing has closed.');

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail(400, 'Send a JSON body with name, at and zone.');
    }
    const parsed = parseGuess(body);
    if (typeof parsed === 'string') return fail(400, parsed);
    if (parsed.nameKey === CARL) return fail(403, "Shouldn't have half arsed it");

    const { guess, token } = await createGuess(parsed);
    return json(201, { ...guess, token });
  } catch (err) {
    if (err instanceof ConflictError) return fail(409, err.message);
    ctx.error('guesses failed', err);
    return fail(500, 'Something went wrong saving that. Try again in a moment.');
  }
}

async function removeGuess(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const token = req.headers.get('x-guess-token');
  if (!token) return fail(401, 'Only the browser that placed a guess can remove it.');
  try {
    const result = await deleteGuess(req.params.id, token);
    if (result === 'not-found') return fail(404, 'That guess no longer exists.');
    if (result === 'forbidden') return fail(403, 'Only the browser that placed a guess can remove it.');
    return { status: 204 };
  } catch (err) {
    ctx.error('delete failed', err);
    return fail(500, 'Something went wrong removing that. Try again in a moment.');
  }
}

app.http('guesses', { route: 'guesses', methods: ['GET', 'POST'], authLevel: 'anonymous', handler: guesses });
app.http('removeGuess', { route: 'guesses/{id}', methods: ['DELETE'], authLevel: 'anonymous', handler: removeGuess });
