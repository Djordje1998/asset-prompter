import { lang, t } from "./i18n";
import { matchTemplate } from "./serverTemplates";

/** A message from the server in the page's language, when it is one of the known ones (serverTemplates.ts). */
export function serverText(message: string): string {
  if (lang === "en") return message;
  const found = matchTemplate(message);
  if (!found) return message;
  // A filled-in name that is itself a label, such as "Slot name", is translated too.
  return t(found.template, Object.fromEntries(Object.entries(found.params).map(([key, value]) => [key, t(value)])));
}
