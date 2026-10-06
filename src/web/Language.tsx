import { useRef, useState } from "react";
import { useDismiss } from "./hooks";
import { LANGS, lang, setLang, t } from "./i18n";
import { Icon } from "./icons";

/** The language switch in the top bar: a small menu, one line per language; choosing one reloads the page in it. */
export function LanguageMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0]!;
  return (
    <div className="lang" ref={ref}>
      <button className="toggle toggle-plain" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} title={`${t("Language")}: ${current.name}`}>
        <span className="lang-code">{current.code.toUpperCase()}</span>
        <Icon name="caret" size={10} className={`picker-caret${open ? " is-open" : ""}`} />
      </button>
      {open && (
        <div className="menu lang-menu" role="listbox" aria-label={t("Language")}>
          {LANGS.map((l) => (
            <button key={l.code} role="option" aria-selected={l.code === lang} className={`menu-item${l.code === lang ? " is-current" : ""}`} onClick={() => setLang(l.code)}>
              <span className="menu-mark">{l.code === lang && <Icon name="check" size={12} />}</span>
              <span className="lang-code">{l.code.toUpperCase()}</span>
              <span className="menu-name">{l.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
