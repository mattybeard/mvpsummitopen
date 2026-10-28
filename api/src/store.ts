import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { odata, TableClient, type TransactionAction } from '@azure/data-tables';
import type { NewGuess } from './validate';

/**
 * Each guess is stored as two rows in one partition:
 *   g_<yyyymmddhhmm>  the guess itself, keyed by its UTC minute
 *   n_<name>          a marker that claims the name
 * Both are written in one transaction, so a taken minute or name fails the whole insert.
 */
const PARTITION = process.env.GUESSES_PARTITION || '2027';
const TABLE = process.env.GUESSES_TABLE || 'guesses';

export interface PublicGuess {
  id: string;
  name: string;
  at: string;
  zone: string;
  placedAt: string;
}

type GuessEntity = {
  partitionKey: string;
  rowKey: string;
  name: string;
  nameKey: string;
  at: string;
  zone: string;
  placedAt: string;
  tokenHash: string;
};

export class ConflictError extends Error {}

let clientPromise: Promise<TableClient> | undefined;

export function getTable(): Promise<TableClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const conn = process.env.TABLES_CONNECTION_STRING;
      if (!conn) throw new Error('TABLES_CONNECTION_STRING is not set');
      const local = /UseDevelopmentStorage=true|127\.0\.0\.1|localhost/i.test(conn);
      const client = TableClient.fromConnectionString(conn, TABLE, { allowInsecureConnection: local });
      await client.createTable();
      return client;
    })();
    clientPromise.catch(() => (clientPromise = undefined));
  }
  return clientPromise;
}

export const minuteKey = (at: Date) => `g_${at.toISOString().slice(0, 16).replace(/[-T:]/g, '')}`;
// RowKeys cannot contain / \ # ?, and encodeURIComponent escapes all of them.
const nameRowKey = (key: string) => `n_${encodeURIComponent(key)}`;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const toPublic = (e: GuessEntity): PublicGuess => ({
  id: e.rowKey,
  name: e.name,
  at: e.at,
  zone: e.zone,
  placedAt: e.placedAt,
});

export async function listGuesses(): Promise<PublicGuess[]> {
  const table = await getTable();
  const rows = table.listEntities<GuessEntity>({
    queryOptions: { filter: odata`PartitionKey eq ${PARTITION} and RowKey ge 'g_' and RowKey lt 'h'` },
  });
  const out: PublicGuess[] = [];
  for await (const row of rows) out.push(toPublic(row));
  return out;
}

async function exists(table: TableClient, rowKey: string): Promise<GuessEntity | null> {
  try {
    return await table.getEntity<GuessEntity>(PARTITION, rowKey);
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return null;
    throw err;
  }
}

/**
 * Stores a guess. `placedAt` and `token` are only overridden by the seed script.
 * Returns the stored guess and the token that lets its creator delete it.
 */
export async function createGuess(
  guess: NewGuess,
  placedAt = new Date(),
  token = randomBytes(24).toString('base64url'),
): Promise<{ guess: PublicGuess; token: string }> {
  const table = await getTable();
  const entity: GuessEntity = {
    partitionKey: PARTITION,
    rowKey: minuteKey(guess.at),
    name: guess.name,
    nameKey: guess.nameKey,
    at: guess.at.toISOString(),
    zone: guess.zone,
    placedAt: placedAt.toISOString(),
    tokenHash: hashToken(token),
  };
  const actions: TransactionAction[] = [
    ['create', entity],
    ['create', { partitionKey: PARTITION, rowKey: nameRowKey(guess.nameKey), guessId: entity.rowKey }],
  ];

  try {
    await table.submitTransaction(actions);
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 409) throw err;
    const taken = await exists(table, entity.rowKey);
    if (taken) throw new ConflictError(`${taken.name} already has that exact minute. Shift yours a little.`);
    throw new ConflictError('There is already a guess under that name. One each.');
  }
  return { guess: toPublic(entity), token };
}

export type DeleteResult = 'deleted' | 'not-found' | 'forbidden';

export async function deleteGuess(id: string, token: string): Promise<DeleteResult> {
  if (!/^g_\d{12}$/.test(id)) return 'not-found';
  const table = await getTable();
  const entity = await exists(table, id);
  if (!entity) return 'not-found';

  const expected = Buffer.from(entity.tokenHash, 'hex');
  const given = Buffer.from(hashToken(token), 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'forbidden';

  await table.submitTransaction([
    ['delete', { partitionKey: PARTITION, rowKey: id }],
    ['delete', { partitionKey: PARTITION, rowKey: nameRowKey(entity.nameKey) }],
  ]);
  return 'deleted';
}
