import { app, type HttpResponseInit } from '@azure/functions';
import { parseWinningTime } from '../winningTime';

async function config(): Promise<HttpResponseInit> {
  const ms = parseWinningTime(process.env.WINNING_TIME);
  return {
    status: 200,
    jsonBody: { winningTime: ms === null ? null : new Date(ms).toISOString() },
    headers: { 'Cache-Control': 'no-store' },
  };
}

app.http('config', { route: 'config', methods: ['GET'], authLevel: 'anonymous', handler: config });
