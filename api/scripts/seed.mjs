// Loads seed/guesses.csv into the table. Run `npm run build` first.
// Uses TABLES_CONNECTION_STRING, or local Azurite when it is not set.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
process.env.TABLES_CONNECTION_STRING ||= 'UseDevelopmentStorage=true';
const { createGuess, ConflictError } = require('../dist/store.js');
const { nameKey, normaliseName } = require('../dist/validate.js');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      (row = []), (field = '');
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const file = new URL('../seed/guesses.csv', import.meta.url);
const [header, ...rows] = parseCsv(await readFile(file, 'utf8'));
const col = (name) => header.indexOf(name);

let added = 0;
for (const r of rows) {
  const name = normaliseName(r[col('name')]);
  const guess = { name, nameKey: nameKey(name), at: new Date(r[col('guess_utc')]), zone: r[col('timezone')] };
  try {
    await createGuess(guess, new Date(r[col('submitted_utc')]));
    added++;
  } catch (err) {
    if (!(err instanceof ConflictError)) throw err;
    console.log(`skipped ${name}: ${err.message}`);
  }
}
console.log(`Seeded ${added} of ${rows.length} guesses.`);
