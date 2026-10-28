# Guess when MVP Summit registration opens

A sweepstake page. People pick the minute they think registration opens, and the closest guess wins. If two guesses are equally close, the one placed first wins.

It runs on Azure Static Web Apps. The page is a Vite build, and the API is a managed Azure Functions app in [api/](api/) that stores guesses in Azure Table Storage.

## Run it locally

You need Node.js and [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local) v4.

```
npm install
npm run dev
```

`npm install` also installs the API's packages. `npm run dev` starts three processes together:

- Azurite, the local storage emulator, which keeps its data in `.azurite/`
- the Functions host on port 7071
- Vite, which forwards `/api` requests to the Functions host

The board starts empty. To clear it again, stop `npm run dev` and delete `.azurite/`.

The API reads its settings from `api/local.settings.json`. That file is not committed, so copy [api/local.settings.sample.json](api/local.settings.sample.json) to create it.

## API

| Method | Route | Does |
| --- | --- | --- |
| `GET` | `/api/guesses` | Lists every guess |
| `POST` | `/api/guesses` | Adds a guess from `{ name, at, zone }`, where `at` is ISO 8601. Returns the guess and a delete token |
| `DELETE` | `/api/guesses/{id}` | Removes a guess. Needs the token in the `x-guess-token` header |

The server checks that the name is present and at most 40 characters, the time is in the future and less than about a year away, and the zone is a real IANA zone. Names can't start with `=`, `+`, `-` or `@`, so a spreadsheet won't treat them as formulas if the table is ever exported. The API also refuses Carl Cookson and Loryan Strant. Submitting as Loryan Strant clears the form and shows "Not until you have AI credits" without saving a guess. The name checks ignore case and extra whitespace.

Each guess is two rows in one table partition. One row is keyed by the guessed UTC minute, and the other claims the lower-cased name. Both rows are written in a single transaction, so a second guess for the same minute or name fails even when both arrive at once.

There is no sign-in. The browser that placed a guess keeps its delete token in `localStorage`, so only that browser can remove it. The table stores a SHA-256 hash of the token, not the token itself.

## Deploy

1. Create a storage account and copy its connection string.
2. Create the Static Web App with these build settings:
   - App location: `/`
   - API location: `api`
   - Output location: `dist`
3. In the Static Web App's environment variables, set `TABLES_CONNECTION_STRING` to the connection string. The API creates the `guesses` table on first use.

Optional settings:

| Setting | Default | Purpose |
| --- | --- | --- |
| `GUESSES_TABLE` | `guesses` | Table name |
| `GUESSES_PARTITION` | `2027` | Partition key. Change it to run a fresh sweepstake next year in the same table |
| `ENTRIES_CLOSED` | `false` | Set to `true` to stop the API accepting new guesses |

## Revealing the answer

1. Set `ENTRIES_CLOSED` to `true`.
2. Set `actualOpening` in [src/config.ts](src/config.ts) to the real opening time in UTC, for example `'2026-12-02T16:00:00Z'`, and redeploy.

The form closes, the board ranks everyone by distance, and the ruler marks the opening time.
