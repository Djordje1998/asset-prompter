/**
 * The server answers a mistake in English, with names filled in ("Slot "hero" does not exist."). Each message it
 * can send is listed here as a template, the names as {placeholders}; serverText.ts shows one that matches
 * through t(), so it reads in the page's language like everything else. A message not listed shows as it came.
 * Keep the templates word for word as the server writes them (src/server: every `new UserError`); a test checks it.
 */
export const TEMPLATES = [
  "Model is required.",
  "No file was received.",
  "No files were received.",
  "No trash tool was found. Install gio (part of GLib) or trash-cli, or delete the files by hand.",
  "Nothing new for the agent: no slot is its turn and it has heard of every approval.",
  "That can no longer be undone.",
  "That folder is not part of a project.",
  "The files are still there; the system did not move them to the recycle bin.",
  "The prompt is empty.",
  "The request body is not valid JSON.",
  "The request body must be a JSON object.",
  "Type must be image or video.",
  '"{file}" is not an image or video this app can show.',
  '"{part}" is not a valid URL part.',
  '"{name}" is a name Windows keeps for a device; choose another.',
  '"{value}" is not a version number.',
  "{entry} is not a slot or a result, so the app cannot tell where it goes. Open the _trash folder to take it out by hand.",
  "{entry} is not in _trash.",
  "{name} is no longer in _trash.",
  "{file} does not exist in {slot} v{n}.",
  "{slot} v{n} already has a {file}; remove it first.",
  "{slot} has no v{n}.",
  "{name} is open in another program (a File Explorer window, a terminal, an editor or a media player). Close it there and try again.",
  '{what} cannot start with "_" or ".".',
  "{what} cannot end with a dot or a space.",
  "{what} contains characters that are not allowed in a folder name.",
  "{what} is required.",
  "A new {file} was added to {slot} v{n} since; remove it first.",
  'A new project named "{name}" was made since.',
  'A new slot named "{name}" was made since.',
  'A project named "{name}" already exists.',
  'A slot named "{name}" already exists.',
  'Project "{name}" does not exist.',
  'Slot "{name}" does not exist.',
  'Slot name "{name}" can only use lowercase letters, digits and single hyphens between them, like hero-banner.',
  "v{n} is approved with this pick. Remove the approval first.",
  // Last: it matches almost anything that ends so.
  "{name} does not exist.",
];

/** Each template as a pattern that takes the names back out of a message. */
const PATTERNS = TEMPLATES.map((template) => {
  const keys: string[] = [];
  const source = template
    .split(/(\{\w+\})/)
    .map((part) => {
      const key = /^\{(\w+)\}$/.exec(part)?.[1];
      if (!key) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      keys.push(key);
      return "(.+?)";
    })
    .join("");
  return { template, keys, pattern: new RegExp(`^${source}$`, "s") };
});

/** The template a message was made from, and the names filled into it; null when none fits. */
export function matchTemplate(message: string): { template: string; params: Record<string, string> } | null {
  for (const { template, keys, pattern } of PATTERNS) {
    const m = pattern.exec(message);
    if (m) return { template, params: Object.fromEntries(keys.map((key, i) => [key, m[i + 1]!])) };
  }
  return null;
}
