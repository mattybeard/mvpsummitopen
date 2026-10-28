import './style.css';
import { blockedNameMessage, normaliseName } from '../api/src/nameRules';
import { config } from './config';
import { fetchGuesses, removeGuess, submitGuess, type Guess } from './data';
import { initials, renderScale, scrollPinIntoView } from './scale';
import {
  allZones,
  browserZone,
  dayKey,
  formatClock,
  formatDay,
  formatDistance,
  formatFull,
  formatLongDay,
  formatOffset,
  formatZoneAbbr,
  wallTimeToUtc,
  zoneCity,
} from './time';

const VIEW_ZONE_KEY = 'mvp-summit-guess:view-zone';

const state = {
  guesses: [] as Guess[],
  loaded: false,
  viewZone: localStorage.getItem(VIEW_ZONE_KEY) || browserZone(),
  selectedId: null as string | null,
  loadError: '',
};

const actual = config.actualOpening ? Date.parse(config.actualOpening) : null;
const zones = allZones();
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const guesses = () => state.guesses;

function zoneOptions(selected: string) {
  return zones
    .map((z) => `<option value="${z}"${z === selected ? ' selected' : ''}>${z.replace(/_/g, ' ')} (${formatOffset(z)})</option>`)
    .join('');
}

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="masthead">
    <div class="masthead-bar">
      <span>Sweepstake &middot; MVP Summit 2027</span>
      <label class="view-zone">
        <span>Times shown in</span>
        <select id="view-zone">${zoneOptions(state.viewZone)}</select>
      </label>
    </div>
    <h1>When does MVP Summit registration <em>open?</em></h1>
    <p class="lede">
      Put your name on a minute. Whoever lands closest to the moment registration goes live wins.
      If two guesses are equally close, the one placed first takes it.
    </p>
  </header>

  <main>
    <section class="entry">
      <form class="ticket" id="guess-form" novalidate>
        <div class="ticket-head">
          <span>Entry slip</span>
          <span class="ticket-no" id="ticket-no"></span>
        </div>
        <label class="field">
          <span>Your name</span>
          <input id="f-name" name="name" autocomplete="name" maxlength="40" required placeholder="As you'd like it on the board" />
        </label>
        <div class="field-row">
          <label class="field">
            <span>Day</span>
            <input id="f-date" name="date" type="date" required />
          </label>
          <label class="field">
            <span>Time</span>
            <input id="f-time" name="time" type="time" step="60" required />
          </label>
        </div>
        <label class="field">
          <span>In your time zone</span>
          <select id="f-zone" name="zone">${zoneOptions(browserZone())}</select>
        </label>
        <p class="preview" id="preview" aria-live="polite"></p>
        <p class="error" id="error" role="alert"></p>
        <button type="submit" class="submit">Put my name down</button>
      </form>

      <aside class="stats" id="stats" aria-label="Summary"></aside>
    </section>

    <section class="scale-section">
      <div class="section-head">
        <h2>The ruler</h2>
        <p>One tag per guess. Weekends are shaded, long ticks are Mondays. Pick a tag to find it on the board.</p>
      </div>
      <div class="scale-scroll" id="scale"></div>
    </section>

    <section class="board">
      <div class="section-head">
        <h2>The board</h2>
      </div>
      <div class="board-scroll">
        <table id="board"></table>
      </div>
    </section>
  </main>

  <footer class="colophon">
    <p>Your guess is saved for everyone to see. Only the browser you placed it from can remove it.</p>
    <p>Not affiliated with Microsoft. Nobody here knows the answer either.</p>
  </footer>
`;

const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
const form = $<HTMLFormElement>('#guess-form');
const fName = $<HTMLInputElement>('#f-name');
const fDate = $<HTMLInputElement>('#f-date');
const fTime = $<HTMLInputElement>('#f-time');
const fZone = $<HTMLSelectElement>('#f-zone');
const preview = $<HTMLParagraphElement>('#preview');
const errorEl = $<HTMLParagraphElement>('#error');
const viewZoneSelect = $<HTMLSelectElement>('#view-zone');
const scaleHost = $<HTMLDivElement>('#scale');
const board = $<HTMLTableElement>('#board');
const stats = $<HTMLElement>('#stats');

function formInstant(): number | null {
  if (!fDate.value || !fTime.value) return null;
  return wallTimeToUtc(fDate.value, fTime.value, fZone.value);
}

function updatePreview() {
  const at = formInstant();
  fDate.min = dayKey(Date.now(), fZone.value);
  if (at === null) {
    preview.textContent = 'Pick a day and a time to see it in other zones.';
    return;
  }
  const parts = [`${formatClock(at, 'UTC')} UTC on ${formatDay(at, 'UTC')}`];
  if (state.viewZone !== 'UTC' && state.viewZone !== fZone.value) {
    parts.push(`${formatClock(at, state.viewZone)} in ${zoneCity(state.viewZone)} on ${formatDay(at, state.viewZone)}`);
  }
  preview.textContent = `That is ${parts.join(', or ')}.`;
}

function validate(name: string, at: number | null): string {
  if (!name) return 'Your name goes on the board, so we need one.';
  if (/^[=+\-@]/.test(name)) return 'Names need to start with a letter or number.';
  if (at === null) return 'Pick both a day and a time.';
  if (at <= Date.now()) return 'That moment has already passed. Pick something in the future.';
  const lower = name.toLocaleLowerCase();
  if (guesses().some((g) => g.name.toLocaleLowerCase() === lower)) {
    return 'There is already a guess under that name. One each.';
  }
  const minute = Math.floor(at / 60_000);
  const taken = guesses().find((g) => Math.floor(g.at / 60_000) === minute);
  if (taken) return `${taken.name} already has that exact minute. Shift yours a little.`;
  return '';
}

let submitting = false;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (actual !== null || submitting) return;
  const name = normaliseName(fName.value);
  if (blockedNameMessage(name)) {
    updateSubmitButton();
    return;
  }
  const at = formInstant();
  const problem = validate(name, at);
  errorEl.textContent = problem;
  if (problem || at === null) return;

  submitting = true;
  updateSubmitButton();
  const zone = fZone.value;
  try {
    const guess = await submitGuess({ name, at, zone });
    state.guesses = [...state.guesses.filter((g) => g.id !== guess.id), guess];
    state.selectedId = guess.id;
    form.reset();
    fZone.value = zone;
    render();
    requestAnimationFrame(() => {
      scrollPinIntoView(scaleHost, guess.id);
      board.querySelector(`[data-id="${guess.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  } catch (err) {
    errorEl.textContent = (err as Error).message;
    // Someone else may have taken the minute or name, so show the latest board.
    void refresh();
  } finally {
    submitting = false;
    updateSubmitButton();
  }
});

const submitButton = $<HTMLButtonElement>('.submit');
const SUBMIT_LABEL = submitButton.textContent!;
function updateSubmitButton() {
  if (actual !== null) return;
  const message = blockedNameMessage(fName.value);
  submitButton.disabled = Boolean(message) || submitting;
  submitButton.classList.toggle('is-blocked-name', Boolean(message));
  submitButton.textContent = message ?? (submitting ? 'Putting it down…' : SUBMIT_LABEL);
}

fName.addEventListener('input', updateSubmitButton);

for (const el of [fDate, fTime, fZone]) el.addEventListener('input', updatePreview);
for (const el of [fName, fDate, fTime]) el.addEventListener('input', () => (errorEl.textContent = ''));

viewZoneSelect.addEventListener('change', () => {
  state.viewZone = viewZoneSelect.value;
  localStorage.setItem(VIEW_ZONE_KEY, state.viewZone);
  render();
});

function select(id: string, from: 'scale' | 'board') {
  state.selectedId = state.selectedId === id ? null : id;
  render();
  if (!state.selectedId) return;
  if (from === 'board') scrollPinIntoView(scaleHost, id);
  else board.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

board.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const remove = target.closest<HTMLButtonElement>('[data-remove]');
  if (remove) {
    const g = state.guesses.find((x) => x.id === remove.dataset.remove);
    if (g && confirm(`Remove the guess from ${g.name}?`)) {
      remove.disabled = true;
      removeGuess(g.id)
        .then(() => {
          state.guesses = state.guesses.filter((x) => x.id !== g.id);
          if (state.selectedId === g.id) state.selectedId = null;
          render();
        })
        .catch((err: Error) => {
          remove.disabled = false;
          alert(err.message);
        });
    }
    return;
  }
  const row = target.closest<HTMLTableRowElement>('tr[data-id]');
  if (row) select(row.dataset.id!, 'board');
});

board.addEventListener('keydown', (e) => {
  const row = (e.target as HTMLElement).closest<HTMLTableRowElement>('tr[data-id]');
  if (row && (e.key === 'Enter' || e.key === ' ') && e.target === row) {
    e.preventDefault();
    select(row.dataset.id!, 'board');
  }
});

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function ranked(list: Guess[]): Guess[] {
  if (actual === null) return [...list].sort((a, b) => a.at - b.at || a.placedAt - b.placedAt);
  return [...list].sort((a, b) => Math.abs(a.at - actual) - Math.abs(b.at - actual) || a.placedAt - b.placedAt);
}

function renderStats(list: Guess[]) {
  const z = state.viewZone;
  if (list.length === 0) {
    const message = state.loadError || (state.loaded ? 'No guesses yet. Be the first.' : 'Fetching the board…');
    stats.innerHTML = `<p class="stats-empty">${esc(message)}</p>`;
    return;
  }
  const times = list.map((g) => g.at);
  const byDay = new Map<string, number>();
  for (const t of times) byDay.set(dayKey(t, z), (byDay.get(dayKey(t, z)) ?? 0) + 1);
  const [busyKey, busyCount] = [...byDay].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const busyAt = times.find((t) => dayKey(t, z) === busyKey)!;

  const cell = (label: string, value: string, note = '') =>
    `<div class="stat"><dt>${label}</dt><dd>${value}${note ? `<small>${note}</small>` : ''}</dd></div>`;

  const items = [cell('Entries', String(list.length))];
  if (actual !== null) {
    const winner = ranked(list)[0];
    items.push(
      cell('Opened', `${formatDay(actual, z)} ${formatClock(actual, z)}`, formatZoneAbbr(actual, z)),
      cell('Winner', esc(winner.name), `off by ${formatDistance(winner.at - actual)}`),
    );
  } else {
    const med = median(times);
    items.push(
      cell('Earliest', formatDay(Math.min(...times), z), formatClock(Math.min(...times), z)),
      cell('Latest', formatDay(Math.max(...times), z), formatClock(Math.max(...times), z)),
      cell('Median', formatDay(med, z), formatClock(med, z)),
      cell('Busiest day', formatDay(busyAt, z), `${busyCount} ${busyCount === 1 ? 'guess' : 'guesses'}`),
    );
  }
  stats.innerHTML = `<dl>${items.join('')}</dl>`;
}

function renderBoard(list: Guess[]) {
  const z = state.viewZone;
  const zoneLabel = `${zoneCity(z)} time`;
  const revealed = actual !== null;
  board.classList.toggle('is-revealed', revealed);
  const head = revealed
    ? `<tr><th class="num">Rank</th><th>Name</th><th>Guess (${esc(zoneLabel)})</th><th class="num">Off by</th><th>Entered from</th></tr>`
    : `<tr><th class="num">No.</th><th>Name</th><th>Guess (${esc(zoneLabel)})</th><th>Entered from</th><th>Placed</th></tr>`;

  if (list.length === 0) {
    board.innerHTML = `<thead>${head}</thead><tbody><tr><td colspan="5" class="board-empty">The board is empty.</td></tr></tbody>`;
    return;
  }

  const entryNo = new Map([...list].sort((a, b) => a.placedAt - b.placedAt).map((g, i) => [g.id, i + 1]));
  let lastDay = '';
  const rows = ranked(list).map((g, i) => {
    const day = dayKey(g.at, z);
    let group = '';
    if (!revealed && day !== lastDay) {
      lastDay = day;
      group = `<tr class="day-row"><th colspan="5" scope="rowgroup">${formatLongDay(g.at, z)}</th></tr>`;
    }
    const cls = [g.id === state.selectedId && 'is-selected', g.mine && 'is-mine', revealed && i === 0 && 'is-winner']
      .filter(Boolean)
      .join(' ');
    const name = `<span class="tag">${esc(initials(g.name))}</span>${esc(g.name)}${
      g.mine && !revealed ? ` <button type="button" class="text-button small" data-remove="${g.id}">remove</button>` : ''
    }`;
    const when = `${revealed ? formatDay(g.at, z) + ', ' : ''}<span class="mono">${formatClock(g.at, z)}</span> <span class="muted">${formatZoneAbbr(g.at, z)}</span>`;
    const from = `${esc(zoneCity(g.zone))} <span class="muted mono">${formatClock(g.at, g.zone)}</span>`;
    const placed = g.placedAt ? formatDay(g.placedAt, z) : '';
    const cells = revealed
      ? `<td class="num">${i + 1}</td><td>${name}</td><td>${when}</td><td class="num mono">${
          g.at < actual ? '−' : '+'
        }${formatDistance(g.at - actual)}</td><td>${from}</td>`
      : `<td class="num">${String(entryNo.get(g.id)).padStart(3, '0')}</td><td>${name}</td><td>${when}</td><td>${from}</td><td class="muted">${placed}${
          g.mine ? ' &middot; yours' : ''
        }</td>`;
    return `${group}<tr data-id="${g.id}" tabindex="0" class="${cls}">${cells}</tr>`;
  });
  board.innerHTML = `<thead>${head}</thead><tbody>${rows.join('')}</tbody>`;
}

function render() {
  const list = guesses();
  $('#ticket-no').textContent = `No. ${String(list.length + 1).padStart(3, '0')}`;
  renderStats(list);
  renderBoard(list);
  renderScale(scaleHost, list, {
    zone: state.viewZone,
    actual,
    selectedId: state.selectedId,
    onSelect: (id) => select(id, 'scale'),
  });
  updatePreview();
}

if (actual !== null) {
  form.classList.add('is-closed');
  for (const el of form.elements) (el as HTMLInputElement).disabled = true;
  $('.submit').textContent = `Closed. Registration opened ${formatFull(actual, state.viewZone)}`;
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(render, 150);
});

render();
// Browsers can restore a typed name on reload without firing an input event.
updateSubmitButton();

async function refresh() {
  try {
    state.guesses = await fetchGuesses();
    state.loadError = '';
  } catch (err) {
    state.loadError = (err as Error).message;
  }
  state.loaded = true;
  if (state.selectedId && !state.guesses.some((g) => g.id === state.selectedId)) state.selectedId = null;
  render();
}

void refresh();
// Pick up guesses other people placed while this tab was in the background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refresh();
});
