import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATES, matchTemplate } from "../src/web/serverTemplates";

const serverDir = join(import.meta.dir, "../src/server");

/** Every message the server can answer a mistake with, its ${...} parts filled with a sample name. */
function serverMessages(): string[] {
  const messages: string[] = [];
  for (const file of readdirSync(serverDir).filter((f) => f.endsWith(".ts"))) {
    const source = readFileSync(join(serverDir, file), "utf8");
    for (const m of source.matchAll(/new UserError\(\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*")/g)) {
      const literal = m[1]!;
      // A message that is only what another program printed is passed on as it is.
      if (literal.startsWith("`${failure}")) continue;
      messages.push(literal.slice(1, -1).replace(/\$\{[^}]*\}/g, "hero").replace(/\\"/g, '"'));
    }
  }
  return messages;
}

test("every message the server can send has a template, so the page can show it translated", () => {
  const messages = serverMessages();
  expect(messages.length).toBeGreaterThan(30);
  const missing = messages.filter((message) => !matchTemplate(message));
  expect(missing).toEqual([]);
});

test("a message is matched by its own template, not by a looser one", () => {
  expect(matchTemplate('Slot "hero" does not exist.')?.template).toBe('Slot "{name}" does not exist.');
  expect(matchTemplate("hero does not exist in hero v2.")?.template).toBe("{file} does not exist in {slot} v{n}.");
  expect(matchTemplate("Slot name is required.")).toEqual({ template: "{what} is required.", params: { what: "Slot name" } });
  expect(matchTemplate("Something nobody wrote.")).toBeNull();
});

test("every template has its Serbian", () => {
  const sr = readFileSync(join(import.meta.dir, "../src/web/sr.ts"), "utf8");
  const untranslated = TEMPLATES.filter((template) => !sr.includes(`${JSON.stringify(template)}:`) && !sr.includes(`'${template}':`));
  expect(untranslated).toEqual([]);
});
