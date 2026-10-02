import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./icons";

// One tooltip for the whole app, in its own style instead of the browser's. Elements keep using the
// plain `title` attribute: on hover it moves to `data-tip`, so the browser's own tooltip never shows.

const DELAY = 450;
const GAP = 8;
const EDGE = 8;

interface Tip {
  text: string;
  anchor: DOMRect;
}

/** Moves `title` to `data-tip`, keeping the text as the accessible name of an element that has no other. */
function adopt(el: HTMLElement): string | null {
  const title = el.getAttribute("title");
  if (title) {
    el.setAttribute("data-tip", title);
    el.removeAttribute("title");
    if (!el.getAttribute("aria-label") && !el.textContent?.trim()) el.setAttribute("aria-label", title);
  }
  return el.getAttribute("data-tip") || null;
}

export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer = 0;
    let current: HTMLElement | null = null;
    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = (e.target as Element | null)?.closest?.<HTMLElement>("[title], [data-tip]") ?? null;
      if (el === current) return;
      hide();
      if (!el) return;
      const text = adopt(el);
      if (!text) return;
      current = el;
      timer = window.setTimeout(() => {
        if (current === el && el.isConnected) setTip({ text: el.getAttribute("data-tip") || text, anchor: el.getBoundingClientRect() });
      }, DELAY);
    };
    const out = (e: PointerEvent) => {
      if (current && !current.contains(e.relatedTarget as Node | null)) hide();
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Above the element when there is room, otherwise below; always inside the window.
  useLayoutEffect(() => {
    if (!tip || !box.current) return setPlace(null);
    const { width, height } = box.current.getBoundingClientRect();
    const a = tip.anchor;
    const below = a.top - GAP - height < EDGE;
    const left = Math.min(Math.max(a.left + a.width / 2 - width / 2, EDGE), window.innerWidth - width - EDGE);
    setPlace({ left, top: below ? a.bottom + GAP : a.top - GAP - height, below });
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={box}
      className={`tip${place ? " is-shown" : ""}${place?.below ? " is-below" : ""}`}
      role="tooltip"
      style={place ? { left: place.left, top: place.top } : { left: 0, top: 0 }}
    >
      <Icon name="info" size={12} />
      <span>{tip.text}</span>
    </div>
  );
}
