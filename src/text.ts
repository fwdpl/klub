/** Polska odmiana po liczbie: plural(1, 'dzień', 'dni', 'dni') → „1 dzień”, plural(5, 'punkt', 'punkty', 'punktów') → „5 punktów”. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return `${n} ${one}`;
  const last = n % 10;
  const teen = n % 100 >= 12 && n % 100 <= 14;
  return `${n} ${last >= 2 && last <= 4 && !teen ? few : many}`;
}
