import { randomUUID } from "node:crypto";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function ensureAskPassScript(rootDir: string): Promise<string> {
  const binDir = join(rootDir, "bin");
  const scriptPath = join(binDir, "git-askpass.sh");
  const script = [
    "#!/bin/sh",
    'case "$1" in',
    '  *Username*) printf "%s\\n" "x-access-token" ;;',
    '  *) printf "%s\\n" "$OPENDIFF_GIT_TOKEN" ;;',
    "esac",
    "",
  ].join("\n");

  await mkdir(binDir, { recursive: true });
  const tempPath = join(binDir, `git-askpass-${randomUUID()}.tmp`);
  try {
    await writeFile(tempPath, script, { mode: 0o700, flag: "wx" });
    await chmod(tempPath, 0o700);
    // Publish only a complete executable, without modifying helpers Git is using.
    await rename(tempPath, scriptPath);
  } finally {
    await rm(tempPath, { force: true });
  }
  return scriptPath;
}
