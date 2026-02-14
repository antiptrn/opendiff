import { readFileSync } from "node:fs";
import { join } from "node:path";

const TEMPLATES_DIR = join(import.meta.dir, "../templates");

export function loadPrompt(name: string, vars: Record<string, string> = {}): string {
  const raw = readFileSync(join(TEMPLATES_DIR, `${name}.md`), "utf-8");
  return raw.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
}
