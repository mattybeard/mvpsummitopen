export const normaliseName = (name: string) => name.trim().replace(/\s+/g, ' ');
export const nameKey = (name: string) => normaliseName(name).toLocaleLowerCase('en');

const blockedNames = [
  { pattern: /^carl cookson$/, message: "Shouldn't have half arsed it" },
  { pattern: /^loryan strant$/, message: 'Not until you have AI credits' },
  { pattern: /\byannick\b/, message: 'Nope. API only' },
];

export function blockedNameMessage(name: string): string | undefined {
  const key = nameKey(name);
  return blockedNames.find(({ pattern }) => pattern.test(key))?.message;
}
