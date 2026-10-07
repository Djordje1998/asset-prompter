import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./icons";

// One tooltip for the whole app, in its own style instead of the browser's. Elements keep using the plain
// `title` attribute. While the pointer is on one, its title is emptied, which keeps the browser's own tooltip
// from showing, and its text is held here; when the pointer leaves, the title gets its text back. React owns
// `title`: one it sets anew meanwhile is held instead, and one it drops (an "Expand" that goes once the card is
// open) stays dropped, so no old copy of a title outlives what React last gave the element.

const DELAY = 450;
const GAP = 8;
const EDGE = 8;

interface Tip {
  text: string;
  anchor: DOMRect;
}

interface Held {
  el: HTMLElement;
  /** The title the element has while it is held; null once React has dropped it. */
  text: string | null;
  /** The accessible name given to it for now, as it has no other and its title is empty; null when it has one. */
  label: string | null;
  watch: MutationObserver;
}

/** Holds the element's title. `changed` hears of a title that React set anew, or dropped, meanwhile. */
function hold(el: HTMLElement, changed: (held: Held) => void): Held | null {
  const title = el.getAttribute("title");
  if (!title) return null;
  const label = !el.getAttribute("aria-label") && !el.textContent?.trim() ? title : null;
  if (label !== null) el.setAttribute("aria-label", label);
  const held: Held = {
    el,
    text: title,
    label,
    watch: new MutationObserver(() => {
      const now = el.getAttribute("title");
      if (now === "") return;
      held.text = now;
      if (now !== null) el.setAttribute("title", "");
      changed(held);
    }),
  };
  el.setAttribute("title", "");
  held.watch.observe(el, { attributes: true, attributeFilter: ["title"] });
  return held;
}

/** Gives the element its title back: the one it had, or the one React set while it was held. */
function release({ el, text, label, watch }: Held): void {
  watch.disconnect();
  if (el.getAttribute("title") === "") {
    if (text) el.setAttribute("title", text);
    else el.removeAttribute("title");
  }
  if (label !== null && el.getAttribute("aria-label") === label) el.removeAttribute("aria-label");
}

export function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer = 0;
    /** The element whose tip is on its way or showing. */
    let current: HTMLElement | null = null;
    /** The element under the pointer, its title held; a click hides its tip but keeps holding it. */
    let held: Held | null = null;
    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const letGo = () => {
      if (held) release(held);
      held = null;
    };
    const show = (el: HTMLElement) => {
      current = el;
      timer = window.setTimeout(() => {
        if (current === el && el.isConnected && held?.el === el && held.text) setTip({ text: held.text, anchor: el.getBoundingClientRect() });
      }, DELAY);
    };
    // A title changed under the pointer: the tip shows the new one, or goes with a dropped one.
    const changed = (h: Held) => {
      if (h !== held || current !== h.el) return;
      hide();
      if (h.text) show(h.el);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = (e.target as Element | null)?.closest?.<HTMLElement>("[title]") ?? null;
      if (el === current) return;
      hide();
      // Back over the element already held, after a click hid its tip: its tip comes again, as before the click.
      if (el !== held?.el) {
        letGo();
        held = el && hold(el, changed);
      }
      if (el && held?.text) show(el);
    };
    const out = (e: PointerEvent) => {
      const el = held?.el;
      if (!el || el.contains(e.relatedTarget as Node | null)) return;
      hide();
      letGo();
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      letGo();
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
  // A short name (what an icon button is) is a plain label; a sentence that explains something gets the info mark.
  const isName = tip.text.length <= 28 && !/[.!?]$/.test(tip.text);
  return (
    <div
      ref={box}
      className={`tip${place ? " is-shown" : ""}${place?.below ? " is-below" : ""}${isName ? " is-name" : ""}`}
      role="tooltip"
      style={place ? { left: place.left, top: place.top } : { left: 0, top: 0 }}
    >
      {!isName && <Icon name="info" size={12} />}
      <span>{tip.text}</span>
    </div>
  );
}
