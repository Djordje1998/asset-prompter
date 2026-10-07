import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { writeStored } from "./hooks";
import { t } from "./i18n";

export type Theme = "dark" | "light";

/**
 * The page's theme: the one chosen with the switch, remembered in this browser, else the system's. index.html
 * sets it before the page draws, so a light page never starts dark; this reads what it set.
 */
function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** How long the new theme takes to spread over the page from the switch. */
const REVEAL_MS = 650;

/**
 * The theme switch in the top bar: a pill of sky, the moon among stars at night, the sun among clouds by day
 * (styles.css, section 28). Where the browser can, the new theme spreads over the page as a circle growing from
 * the switch: the page is captured as it is, the theme changed under it, and the new look revealed through the circle.
 */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const button = useRef<HTMLButtonElement>(null);
  const light = theme === "light";

  const flip = () => {
    const next: Theme = light ? "dark" : "light";
    const apply = () => {
      document.documentElement.dataset.theme = next;
      writeStored("theme", next);
      // Inside the transition's callback the new state must be on the page before the capture of it is taken.
      flushSync(() => setTheme(next));
    };
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduced || !button.current) return apply();
    const box = button.current.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    // Far enough to cover the farthest corner of the window.
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(apply);
    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: REVEAL_MS, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" },
        );
      })
      .catch(() => {});
  };

  return (
    <button
      ref={button}
      className={`theme-switch${light ? " is-light" : ""}`}
      role="switch"
      aria-checked={light}
      aria-label={t("Light theme")}
      title={light ? t("Switch to the dark theme") : t("Switch to the light theme")}
      onClick={flip}
    >
      <span className="theme-star s1" aria-hidden="true" />
      <span className="theme-star s2" aria-hidden="true" />
      <span className="theme-star s3" aria-hidden="true" />
      <span className="theme-cloud c1" aria-hidden="true" />
      <span className="theme-cloud c2" aria-hidden="true" />
      <span className="theme-knob" aria-hidden="true">
        <span className="theme-rays" />
        <span className="theme-crater k1" />
        <span className="theme-crater k2" />
        <span className="theme-crater k3" />
      </span>
    </button>
  );
}
