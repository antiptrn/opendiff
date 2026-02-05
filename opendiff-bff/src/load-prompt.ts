import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROMPTS_DIR = join(import.meta.dir, "../prompts");

export function loadPrompt(name: string, vars: Record<string, string> = {}): string {
  const raw = readFileSync(join(PROMPTS_DIR, `${name}.md`), "utf-8");
  return raw.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
}
