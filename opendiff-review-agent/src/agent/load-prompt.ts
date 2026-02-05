import { readFileSync } from "node:fs";
import { join } from "node:path";

// process.cwd() is the package root (set by --cwd), works for both source and bundled builds
const PROMPTS_DIR = join(process.cwd(), "prompts");

export function loadPrompt(name: string, vars: Record<string, string> = {}): string {
  const raw = readFileSync(join(PROMPTS_DIR, `${name}.md`), "utf-8");
  return raw.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
}
