import { readStored, writeStored } from "./hooks";

/**
 * The app's languages. English is the text in the code and the key of every translation; another language is a
 * map from that English to its own words, in a file next to this one (sr.ts). A missing entry falls back to the
 * English, so a new text works at once and is translated when someone gets to it.
 *
 * `t()` reads the language once, when the page loads: changing it reloads the page, which is simpler and safer
 * than making every component listen, and costs nothing in a local app.
 */

export type Lang = "en" | "sr";

export const LANGS: { code: Lang; name: string }[] = [
  { code: "en", name: "English" },
  { code: "sr", name: "Srpski" },
];

const STORAGE_KEY = "lang";

export function currentLang(): Lang {
  const stored = readStored(STORAGE_KEY);
  return stored === "sr" ? "sr" : "en";
}

export function setLang(lang: Lang): void {
  writeStored(STORAGE_KEY, lang === "en" ? null : lang);
  location.reload();
}

export const lang: Lang = currentLang();
// The page declares its language, for the browser's spell check, hyphenation and screen readers.
document.documentElement.lang = lang === "sr" ? "sr-Latn" : "en";

/** Every translation: English text to the words in the language. Filled by the language files below. */
const tables: Partial<Record<Lang, Record<string, string>>> = {};

export function register(code: Lang, table: Record<string, string>): void {
  tables[code] = table;
}

/** The date and time formats of the current language, for "when" labels. */
export const LOCALE: Record<Lang, string> = { en: "en-GB", sr: "sr-Latn-RS" };

const plurals = new Intl.PluralRules(LOCALE[lang]);
/** The form for a count, in the order the translations write them: one, few, other. */
const PLURAL_FORM: Partial<Record<Intl.LDMLPluralRule, number>> = { one: 0, few: 1 };

/**
 * The text in the current language. `{name}` in the text is filled from `params`. The English is the key, so
 * write the English here exactly as it should read, including its punctuation.
 *
 * A translation picks the word for a count with `{n|one|few|other}`, the forms Serbian has: 1, 21, 31 take the
 * first, 2 to 4 (not 12 to 14) the second, the rest the third. A form may hold placeholders: `{n|stavka|sve {n} stavke}`.
 */
export function t(english: string, params?: Record<string, string | number>): string {
  const text = tables[lang]?.[english] ?? english;
  if (!params) return text;
  return text
    .replace(/\{(\w+)\|((?:[^{}]|\{\w+\})*)\}/g, (match, key: string, list: string) => {
      const n = Number(params[key]);
      if (!(key in params) || !Number.isFinite(n)) return match;
      const forms = list.split("|");
      return forms[Math.min(PLURAL_FORM[plurals.select(n)] ?? 2, forms.length - 1)]!;
    })
    .replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}
