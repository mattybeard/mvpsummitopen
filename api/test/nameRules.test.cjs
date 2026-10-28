const assert = require('node:assert/strict');
const { test } = require('node:test');
const { blockedNameMessage, nameKey, normaliseName } = require('../dist/nameRules');

test('normalizes case and whitespace consistently', () => {
  assert.equal(normaliseName('  Carl \t Cookson  '), 'Carl Cookson');
  assert.equal(nameKey('  Carl \t Cookson  '), 'carl cookson');
});

test('blocks each easter egg with its own message', () => {
  for (const [name, message] of [
    ['Carl Cookson', "Shouldn't have half arsed it"],
    ['  cArL   cOoKsOn  ', "Shouldn't have half arsed it"],
    ['Loryan Strant', 'Not until you have AI credits'],
    ['  LORYAN   STRANT  ', 'Not until you have AI credits'],
    ['Yannick', 'Nope. API only'],
    ['YANNICK Smith', 'Nope. API only'],
    ['Alex Yannick Smith', 'Nope. API only'],
    ['Alex yAnNiCk', 'Nope. API only'],
    ['Alex (Yannick)', 'Nope. API only'],
    ['Alex-Yannick', 'Nope. API only'],
  ]) {
    assert.equal(blockedNameMessage(name), message, name);
  }
});

test('allows unrelated names and does not match partial words', () => {
  for (const name of ['', 'Alex Smith', 'Carl', 'Loryan', 'Carl Cookson Smith', 'Loryan Strant Smith', 'Yannickson', 'NotYannick']) {
    assert.equal(blockedNameMessage(name), undefined, name);
  }
});
