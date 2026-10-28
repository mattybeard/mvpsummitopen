import type { Guess } from './data';
import { addDays, dayKey, formatClock, formatDay, formatZoneAbbr, midnight, weekday, zoneCity } from './time';

const PX_PER_DAY = 30;
const PIN_W = 26;
const PIN_H = 20;
const PIN_GAP = 2;
const AXIS_H = 64;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface ScaleOptions {
  zone: string;
  actual: number | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function initials(name: string): string {
  const words = name.replace(/["'()]/g, '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function renderScale(host: HTMLElement, guesses: Guess[], opts: ScaleOptions) {
  host.replaceChildren();
  const { zone, actual } = opts;

  const instants = guesses.map((g) => g.at);
  if (actual !== null) instants.push(actual);
  if (instants.length === 0) {
    host.innerHTML = '<p class="scale-empty">Nobody has guessed yet. The ruler appears once someone does.</p>';
    return;
  }

  const firstKey = addDays(dayKey(Math.min(...instants), zone), -1);
  const lastKey = addDays(dayKey(Math.max(...instants), zone), 1);
  const days: { key: string; start: number }[] = [];
  for (let k = firstKey; k <= lastKey; k = addDays(k, 1)) days.push({ key: k, start: midnight(k, zone) });
  const rangeStart = days[0].start;
  const rangeEnd = midnight(addDays(lastKey, 1), zone);

  const width = Math.max(host.clientWidth, days.length * PX_PER_DAY);
  const x = (t: number) => ((t - rangeStart) / (rangeEnd - rangeStart)) * width;

  // Stack pins into rows so close guesses sit on top of each other instead of overlapping.
  const sorted = [...guesses].sort((a, b) => a.at - b.at);
  const rowEnds: number[] = [];
  const placed = sorted.map((g) => {
    const px = x(g.at);
    let row = rowEnds.findIndex((end) => end <= px - PIN_W / 2);
    if (row === -1) row = rowEnds.push(0) - 1;
    rowEnds[row] = px + PIN_W / 2 + PIN_GAP;
    return { g, px, row };
  });

  const rows = Math.max(rowEnds.length, 3);
  const height = AXIS_H + rows * (PIN_H + PIN_GAP) + 40;

  const track = document.createElement('div');
  track.className = 'scale-track';
  track.style.width = `${width}px`;
  track.style.height = `${height}px`;
  track.style.setProperty('--axis-h', `${AXIS_H}px`);

  let lastMonth = -1;
  const labelEvery = days.length > 50 ? 7 : days.length > 24 ? 2 : 1;
  days.forEach((d, i) => {
    const left = x(d.start);
    const right = i + 1 < days.length ? x(days[i + 1].start) : width;
    const wd = weekday(d.key);
    const [, m, dom] = d.key.split('-').map(Number);

    if (wd === 0 || wd === 6) {
      const band = document.createElement('div');
      band.className = 'scale-weekend';
      band.style.left = `${left}px`;
      band.style.width = `${right - left}px`;
      track.append(band);
    }

    const tick = document.createElement('div');
    tick.className = wd === 1 ? 'scale-tick major' : 'scale-tick';
    tick.style.left = `${left}px`;
    track.append(tick);

    for (const q of [0.25, 0.5, 0.75]) {
      const minor = document.createElement('div');
      minor.className = q === 0.5 ? 'scale-tick minor noon' : 'scale-tick minor';
      minor.style.left = `${left + (right - left) * q}px`;
      track.append(minor);
    }

    const showLabel = labelEvery === 1 || wd === 1 || (labelEvery === 2 && i % 2 === 0);
    if (showLabel && right - left > 0) {
      const label = document.createElement('div');
      label.className = 'scale-day';
      label.style.left = `${left + (right - left) / 2}px`;
      label.innerHTML = `<span>${'SMTWTFS'[wd]}</span>${dom}`;
      track.append(label);
    }

    if (m - 1 !== lastMonth) {
      lastMonth = m - 1;
      const month = document.createElement('div');
      month.className = 'scale-month';
      month.style.left = `${left}px`;
      month.textContent = `${MONTHS[m - 1]} ${d.key.slice(0, 4)}`;
      track.append(month);
    }
  });

  const now = Date.now();
  if (now >= rangeStart && now <= rangeEnd) {
    const nowLine = document.createElement('div');
    nowLine.className = 'scale-now';
    nowLine.style.left = `${x(now)}px`;
    nowLine.dataset.label = 'Now';
    track.append(nowLine);
  }

  if (actual !== null) {
    const line = document.createElement('div');
    line.className = 'scale-actual';
    line.style.left = `${x(actual)}px`;
    line.dataset.label = `Opened ${formatDay(actual, zone)} ${formatClock(actual, zone)}`;
    track.append(line);
  }

  const tip = document.createElement('div');
  tip.className = 'scale-tip';
  tip.hidden = true;

  for (const { g, px, row } of placed) {
    const mark = document.createElement('div');
    mark.className = 'scale-mark';
    mark.style.left = `${px}px`;
    track.append(mark);

    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'scale-pin';
    if (g.mine) pin.classList.add('is-mine');
    if (g.id === opts.selectedId) pin.classList.add('is-selected');
    pin.dataset.id = g.id;
    pin.style.left = `${px - PIN_W / 2}px`;
    pin.style.bottom = `${AXIS_H + PIN_GAP + 6 + row * (PIN_H + PIN_GAP)}px`;
    pin.textContent = initials(g.name);
    const when = `${formatDay(g.at, zone)}, ${formatClock(g.at, zone)} ${formatZoneAbbr(g.at, zone)}`;
    pin.setAttribute('aria-label', `${g.name}: ${when}`);

    const show = () => {
      tip.innerHTML = '';
      const strong = document.createElement('strong');
      strong.textContent = g.name;
      const line = document.createElement('span');
      line.textContent = when;
      const from = document.createElement('small');
      from.textContent = `Guessed from ${zoneCity(g.zone)}`;
      tip.append(strong, line, from);
      tip.hidden = false;
      const tipX = Math.min(Math.max(px, 90), width - 90);
      tip.style.left = `${tipX}px`;
      const pinBottom = parseFloat(pin.style.bottom);
      const above = pinBottom + PIN_H + 8;
      tip.style.bottom = `${above + 72 > height ? Math.max(4, pinBottom - 72) : above}px`;
    };
    const hide = () => (tip.hidden = true);
    pin.addEventListener('mouseenter', show);
    pin.addEventListener('focus', show);
    pin.addEventListener('mouseleave', hide);
    pin.addEventListener('blur', hide);
    pin.addEventListener('click', () => opts.onSelect(g.id));
    track.append(pin);
  }

  track.append(tip);
  host.append(track);
}

export function scrollPinIntoView(host: HTMLElement, id: string) {
  const pin = host.querySelector<HTMLElement>(`.scale-pin[data-id="${CSS.escape(id)}"]`);
  if (!pin) return;
  const target = pin.offsetLeft - host.clientWidth / 2;
  host.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
}
