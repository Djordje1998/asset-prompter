/** The name a cloned slot is offered: hero -> hero-v2, hero-v2 -> hero-v3, skipping names already taken. */
export function cloneName(name: string, taken: string[]): string {
  const m = /^(.+)-v(\d+)$/.exec(name);
  const base = m ? m[1]! : name;
  let n = m ? Number(m[2]) + 1 : 2;
  while (taken.includes(`${base}-v${n}`)) n++;
  return `${base}-v${n}`;
}
