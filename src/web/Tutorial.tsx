import { useEffect, useState } from "react";
import doneArt from "./art/empty-done.png";
import { useEscape } from "./hooks";
import { t } from "./i18n";
import whyAnyGenerator from "./tutorial/idea-any-generator.webp";
import whyCostsLess from "./tutorial/idea-costs-less.webp";
import whyFinalFiles from "./tutorial/idea-final-files.webp";
import whySeesResult from "./tutorial/idea-sees-result.webp";
import whyVideo from "./tutorial/idea-understands-video.webp";
import whyVariants from "./tutorial/idea-variants.webp";
import type { Status } from "../shared/types";
import { Icon, type IconName, Logo } from "./icons";
import { STATUS_LABEL } from "./lib";
import { STATUS_ICON } from "./shared";
import shotAgent from "./tutorial/agent.webp";
import shotChanges from "./tutorial/changes.webp";
import shotDone from "./tutorial/done.webp";
import shotFeed from "./tutorial/feed.webp";
import shotGenerate from "./tutorial/generate.webp";
import shotLightbox from "./tutorial/lightbox.webp";
import { MARKS, type Mark } from "./tutorial/marks";
import shotNotify from "./tutorial/notify.webp";
import shotProjects from "./tutorial/projects.webp";
import shotReview from "./tutorial/review.webp";

/**
 * The guided tour: a dialog that walks through the app in steps, each with a picture of the real screen.
 * The pictures come from a demo project; the numbered marks drawn over them match the numbered points.
 */
interface Step {
  id: string;
  /** The short name of the step, shown above its title and on its dot. */
  kicker: string;
  title: string;
  body: string;
  /** With a screenshot, point N explains mark N. */
  points: string[];
  shot?: { src: string; marks: readonly Mark[] };
  art?: "why" | "loop" | "extras";
}

const STEPS: Step[] = [
  {
    id: "why",
    kicker: t("The idea"),
    title: t("Your agent plans, you generate"),
    body: t("Your agent works in files, so Asset Prompter turns image and video generation into files too. The agent writes what it needs, you make it in the generator you like, and everything comes back to a folder the agent can read."),
    points: [
      t("Each side does what it is best at: the agent plans and checks, you generate and decide."),
      t("No MCP server or API key is needed. Use any generator at its own price."),
      t("Your approval is final, so nothing reaches the project without you."),
    ],
    art: "why",
  },
  {
    id: "welcome",
    kicker: t("Welcome"),
    title: t("You and your agent, one shared folder"),
    body: t("Your AI agent knows which images and videos it needs. You are the one who can generate them. Asset Prompter is the hand-off between you two, and nothing is final until you approve it."),
    points: [
      t("The pictures use Google Flow as the generator, but it works the same with any image or video app you generate in."),
      t("The agent's review is optional. Approve a result yourself and it goes straight to Done; ask the agent only when you want its opinion."),
      t("This tour takes about two minutes. Use the buttons below or the arrow keys."),
      t("Everything is plain files in a folder. There is no account and no database."),
      t("You can open it again any time with the Tutorial button in the top bar."),
    ],
    art: "loop",
  },
  {
    id: "projects",
    kicker: t("Projects"),
    title: t("Start with a project"),
    body: t("A project is just a folder. Each one holds the assets for one piece of work, such as a website or a campaign."),
    points: [
      t("The project you are in. Click it to switch to another one."),
      t("The number counts the slots that wait for you in that project."),
      t("Add a project: make a new one, or point at a folder inside the repo your agent works in."),
    ],
    shot: { src: shotProjects, marks: MARKS.projects },
  },
  {
    id: "agent",
    kicker: t("Your agent"),
    title: t("Bring in your agent"),
    body: t("A new project starts empty. One message is all your agent needs to learn how the folder works."),
    points: [
      t("Press Copy agent instructions and paste it into a new chat with your agent. It starts writing prompts into the project."),
      t("The same button is always in the top bar. View shows what gets copied."),
      t("No agent at hand? New slot lets you write a prompt yourself."),
    ],
    shot: { src: shotAgent, marks: MARKS.agent },
  },
  {
    id: "feed",
    kicker: t("The feed"),
    title: t("Every asset is a slot"),
    body: t("Each card is one slot: one image or video the agent asked for. Its status tag tells you whose turn it is."),
    points: [
      t("In progress holds the open slots. Approved ones move to Done."),
      t("Filter by status. {status:waiting_generation} and {status:waiting_review} are your turn. {status:waiting_input} means the slot is built from another slot's image and waits until that one is approved."),
      t("The tag on a card shows the step the slot is at now, and whose turn it is."),
      t("Write a new version yourself, clone the slot, or delete it. Deleted slots go to _trash."),
    ],
    shot: { src: shotFeed, marks: MARKS.feed },
  },
  {
    id: "generate",
    kicker: t("Generate"),
    title: t("Generate it, then drop it back"),
    body: t("A slot marked {status:waiting_generation} waits for you. Open the tool you generate with, such as Google Flow, and work through the card from top to bottom."),
    points: [
      t("In the tool, choose these settings first: image or video, the aspect ratio and the model."),
      t("Press {button:Copy prompt} and paste it into the tool's prompt box. The button turns green, so you can see which prompts you already copied."),
      t("Add the reference images the card lists to the tool: press Copy image and paste it there, or drag the picture onto the tool's upload area."),
      t("Drop the result here or choose the file. Images can also be pasted with Ctrl+V. Several results are fine."),
    ],
    shot: { src: shotGenerate, marks: MARKS.generate },
  },
  {
    id: "notify",
    kicker: t("Hand over"),
    title: t("Hand it to the agent"),
    body: t("The agent can check each result against what it asked for. Already happy with one? Approve it yourself and skip this step."),
    points: [
      t("Your result sits in the card. The app checks its size and length against the settings."),
      t("The slot now says {status:waiting_agent}."),
      t("Press {button:Notify agent} when your batch is in. It also tells the agent what you approved. A green dot means the agent is listening, and {button:Stop} beside it ends that; if it is not listening, tell it \"done\" in the chat."),
    ],
    shot: { src: shotNotify, marks: MARKS.notify },
  },
  {
    id: "review",
    kicker: t("Approve"),
    title: t("Read the review, then approve"),
    body: t("The agent approves a result or asks for another try. Its approval is a recommendation. Yours is the one that counts."),
    points: [
      t("Click the chip to read what the agent thinks of the result."),
      t("With several results the agent picks one (purple check). Click another thumbnail to pick it yourself (green). Click your pick again to take it back."),
      t("Approve makes this version final and moves the slot to Done. From then on the agent leaves it alone."),
    ],
    shot: { src: shotReview, marks: MARKS.review },
  },
  {
    id: "changes",
    kicker: t("Change requests"),
    title: t("Not right yet? Ask for changes"),
    body: t("You never rewrite a prompt yourself. Say what should change, and the agent writes the next version: a new prompt that asks for that change. You generate it like the first one."),
    points: [
      t("{button:Request changes} opens a note for the agent. It saves when you click away. Then press {button:Notify agent}: the agent writes v2, and the slot comes back to you as {status:waiting_generation}."),
      t("Earlier versions stay folded under the card, with what you asked for."),
    ],
    shot: { src: shotChanges, marks: MARKS.changes },
  },
  {
    id: "lightbox",
    kicker: t("Compare"),
    title: t("Compare results full size"),
    body: t("Click any image to open the viewer. It holds every result of the slot, across all its versions."),
    points: [
      t("Every result is in the strip. The white frame is the one on screen; the check marks the pick, green for yours and purple for the agent's."),
      t("Select makes the result on screen your pick."),
      t("Copy image puts it on the clipboard, ready to paste as a reference."),
    ],
    shot: { src: shotLightbox, marks: MARKS.lightbox },
  },
  {
    id: "done",
    kicker: t("Done"),
    title: t("Collect the finished assets"),
    body: t("Done is the shelf of approved assets. They are final: the agent uses these files and only makes variants of them."),
    points: [
      t("Click a tile to see the asset full size. Click its name to copy it."),
      t("This badge counts the variants the agent made from it: crops, sizes and formats."),
      t("Copy the image with one click."),
      t("Details shows the whole history. Remove the approval there to reopen the slot, or clone it to try another direction."),
    ],
    shot: { src: shotDone, marks: MARKS.done },
  },
  {
    id: "extras",
    kicker: t("Good to know"),
    title: t("That is the whole loop"),
    body: t("Prompt, generate, review, approve. A few extras make long sessions easier."),
    points: [
      t("The browser tab shows how many slots are still open, so the app can wait in the background."),
      t("To change an approved asset, remove its approval in Details, or clone the slot and keep the original."),
      t("Open this tour again any time with the Tutorial button in the top bar."),
    ],
    art: "extras",
  },
];

/**
 * Step text can show the app's own pieces inline, so the reader sees exactly what to look for:
 * {status:waiting_generation} draws that status tag, {button:Notify agent} a button with that label.
 */
const INLINE = /{(status|button):([^}]+)}/g;

function Rich({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    parts.push(text.slice(last, m.index));
    const [, kind, value] = m;
    if (kind === "status") {
      const status = value as Status;
      parts.push(
        <span key={m.index} className={`status-tag status-${status} tour-inline`}>
          <Icon name={STATUS_ICON[status]} size={12} />
          {t(STATUS_LABEL[status])}
        </span>,
      );
    } else {
      parts.push(
        <span key={m.index} className="tour-inline tour-inline-button">
          {t(value)}
        </span>,
      );
    }
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

/** The loop on the first step: who does what, in order. */
const LOOP: { who: string; icon: IconName; tone: string; title: string; text: string; optional?: boolean }[] = [
  { who: t("Agent"), icon: "robot", tone: "agent", title: t("Writes the prompt"), text: t("One slot per asset, with the settings to use.") },
  { who: t("You"), icon: "spark", tone: "generate", title: t("Generate it"), text: t("In Google Flow or any other generator. Drop the result back.") },
  { who: t("Agent · optional"), icon: "eye", tone: "review", title: t("Reviews the result"), text: t("Only when you want its opinion. Recommends it, or writes the next version."), optional: true },
  { who: t("You"), icon: "check", tone: "approved", title: t("Approve"), text: t("Any time, review or not. Your approval is final: the asset is done.") },
];

function LoopArt() {
  return (
    <div className="tour-art tour-loop">
      <div className="tour-loop-row">
        {LOOP.map((node, i) => (
          <div key={node.title} className={`tour-node tone-${node.tone}${node.optional ? " is-optional" : ""}`} style={{ "--i": i } as React.CSSProperties}>
            <span className="tour-node-icon">
              <Icon name={node.icon} size={24} />
            </span>
            <span className="tour-node-who">{node.who}</span>
            <strong>{node.title}</strong>
            <span className="tour-node-text">{node.text}</span>
            {i < LOOP.length - 1 && <span className="tour-link" aria-hidden="true" />}
          </div>
        ))}
      </div>
      <div className="tour-loop-back" aria-hidden="true">
        <span>{t("next version")}</span>
      </div>
    </div>
  );
}

/** What the agent gains from the shared folder, on the first step. */
// Pictures made with Asset Prompter itself, in projects/asset-prompter-brand (the idea-* slots).
// `text` stays one short line so the picture keeps its room; `more` shows on hover.
const WHY: { art: string; title: string; text: string; more: string }[] = [
  { art: whySeesResult, title: t("Sees every result"), text: t("Checks each one against its prompt."), more: t("Compares each image with its prompt and settings, and says what is off.") },
  { art: whyVideo, title: t("Understands video"), text: t("Judges a clip frame by frame."), more: t("Frame sheets, the first and last frame and a motion map let it judge a clip it cannot play.") },
  { art: whyFinalFiles, title: t("Has every final file"), text: t("Approved assets land in your project."), more: t("Approved assets sit in the project folder, ready for the agent to use in its work.") },
  { art: whyVariants, title: t("Makes variants"), text: t("Crops, sizes and formats, no new run."), more: t("Crops, sizes and formats from the final asset, without another generation.") },
  { art: whyAnyGenerator, title: t("Any generator"), text: t("No MCP or API needed."), more: t("Works with tools that have no MCP or API, such as Google Flow.") },
  { art: whyCostsLess, title: t("Costs less"), text: t("Use the plan you already pay for."), more: t("Generate on a plan you already pay for, instead of paying per API call.") },
];

function WhyArt() {
  return (
    <div className="tour-art tour-why">
      <ul className="tour-extras-grid">
        {WHY.map((item, i) => (
          <li key={item.title} className="tour-extra" title={item.more} style={{ "--i": i } as React.CSSProperties}>
            <img className="tour-why-art" src={item.art} alt="" />
            <strong>{item.title}</strong>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const EXTRAS: { icon: IconName; title: string; text: string }[] = [
  { icon: "speaker", title: t("Sound"), text: t("A short beep when it is your turn again.") },
  { icon: "sliders", title: t("View"), text: t("Page width, card density and tiles per row.") },
  { icon: "layers", title: t("Clone"), text: t("Copy a slot to try another direction.") },
  { icon: "undo", title: t("Undo"), text: t("Ctrl+Z brings back what you just removed, until your next change.") },
  { icon: "clipboard", title: t("Paste"), text: t("Point at a card and press Ctrl+V.") },
  { icon: "folder", title: t("Open folder"), text: t("Every prompt and result is a plain file.") },
];

function ExtrasArt() {
  return (
    <div className="tour-art tour-extras">
      <img className="tour-extras-art" src={doneArt} alt="" />
      <ul className="tour-extras-grid">
        {EXTRAS.map((extra, i) => (
          <li key={extra.title} className="tour-extra" style={{ "--i": i } as React.CSSProperties}>
            <span className="tour-extra-icon">
              <Icon name={extra.icon} size={16} />
            </span>
            <strong>{extra.title}</strong>
            <span>{extra.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Tutorial({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  /** The step shown before this one: its picture fades out underneath, and it gives the slide its direction. */
  const [from, setFrom] = useState<number | null>(null);
  /** The mark in the spotlight, while its point or the mark itself is under the pointer. */
  const [active, setActive] = useState<number | null>(null);
  const step = STEPS[index]!;
  const last = index === STEPS.length - 1;
  const direction = from !== null && from > index ? "back" : "next";
  const ghost = from !== null ? STEPS[from]!.shot?.src : undefined;

  const go = (to: number) => {
    if (to < 0 || to >= STEPS.length || to === index) return;
    setFrom(index);
    setIndex(to);
    setActive(null);
  };

  useEscape(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // Every picture is fetched up front, so a step never opens on an empty frame.
  useEffect(() => {
    for (const s of STEPS) if (s.shot) new Image().src = s.shot.src;
  }, []);

  return (
    <div className="overlay tour-overlay">
      <div className="tour" role="dialog" aria-modal="true" aria-label={t("Tutorial, step {n} of {total}: {title}", { n: index + 1, total: STEPS.length, title: step.title })}>
        <header className="tour-head">
          <span className="tour-brand">
            <Logo size={20} />
            {t("How Asset Prompter works")}
          </span>
          <span className="tour-count">
            {index + 1} / {STEPS.length}
          </span>
          <button className="modal-close" onClick={onClose} aria-label={t("Close the tutorial")} title={t("Close (Esc)")}>
            <Icon name="x" size={12} />
          </button>
        </header>

        <div className="tour-stage">
          <div className={`tour-frame${step.shot ? "" : " is-art"}`}>
            {ghost && <img key={`ghost-${from}`} className="tour-ghost" src={ghost} alt="" />}
            <div key={step.id} className={`tour-scene is-${direction}${active !== null ? " has-active" : ""}`}>
              {step.shot && <img className="tour-shot" src={step.shot.src} alt={t("The app during the step \"{title}\"", { title: step.title })} />}
              {step.shot?.marks.map((m, i) => (
                <span
                  key={i}
                  className={`tour-mark${active === i ? " is-active" : ""}${m.y < 7 ? " is-low" : ""}`}
                  style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.w}%`, height: `${m.h}%`, "--i": i } as React.CSSProperties}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                >
                  <span className="tour-mark-n">{i + 1}</span>
                </span>
              ))}
              {step.art === "why" && <WhyArt />}
              {step.art === "loop" && <LoopArt />}
              {step.art === "extras" && <ExtrasArt />}
            </div>
          </div>
        </div>

        <div key={step.id} className={`tour-text is-${direction}`}>
          <div className="tour-lead">
            <span className="tour-kicker">
              <span className="tour-kicker-n">{String(index + 1).padStart(2, "0")}</span>
              {step.kicker}
            </span>
            <h2>{step.title}</h2>
            <p>
              <Rich text={step.body} />
            </p>
          </div>
          <ol className={`tour-points${step.shot ? "" : " is-plain"}`}>
            {step.points.map((point, i) => (
              <li
                key={i}
                className={active === i ? "is-active" : undefined}
                style={{ "--i": i } as React.CSSProperties}
                onMouseEnter={() => step.shot && setActive(i)}
                onMouseLeave={() => setActive(null)}
              >
                <span className="tour-point-n" aria-hidden="true">
                  {step.shot ? i + 1 : ""}
                </span>
                <span>
                  <Rich text={point} />
                </span>
              </li>
            ))}
          </ol>
        </div>

        <footer className="tour-foot">
          <div className="tour-dots" role="tablist" aria-label={t("Steps")}>
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={i === index}
                className={`tour-dot${i === index ? " is-on" : ""}${i < index ? " is-seen" : ""}`}
                onClick={() => go(i)}
                title={t("{n}. {kicker}", { n: i + 1, kicker: s.kicker })}
                aria-label={t("Step {n}: {kicker}", { n: i + 1, kicker: s.kicker })}
              />
            ))}
          </div>
          {!last && (
            <button className="link tour-skip" onClick={onClose}>
              {t("Skip")}
            </button>
          )}
          <button className="btn" onClick={() => go(index - 1)} disabled={index === 0}>
            <Icon name="chevron" className="flip" size={12} />
            {t("Back")}
          </button>
          <button className="btn btn-primary tour-next" autoFocus onClick={() => (last ? onClose() : go(index + 1))}>
            {last ? t("Start working") : t("Next")}
            <Icon name={last ? "check" : "chevron"} size={12} />
          </button>
        </footer>
      </div>
    </div>
  );
}
