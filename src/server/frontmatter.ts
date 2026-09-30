import YAML from "yaml";

export interface Doc {
  data: Record<string, unknown>;
  body: string;
  error: string | null;
}

const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/;

export function parseDoc(raw: string): Doc {
  const match = FRONTMATTER.exec(raw);
  if (!match) return { data: {}, body: raw.trim(), error: "No frontmatter block (--- … ---) at the top of the file." };
  try {
    const data = YAML.parse(match[1]!);
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return { data: {}, body: match[2]!.trim(), error: "Frontmatter is not a list of key: value pairs." };
    }
    return { data, body: match[2]!.trim(), error: null };
  } catch (e) {
    return { data: {}, body: match[2]!.trim(), error: `Frontmatter is not valid YAML: ${(e as Error).message}` };
  }
}

export function writeDoc(data: Record<string, unknown>, body: string): string {
  return `---\n${YAML.stringify(data).trimEnd()}\n---\n\n${body.trim()}\n`;
}
