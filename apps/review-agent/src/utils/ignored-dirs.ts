function normalizeIgnoredPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function parseIgnoredDirs(value?: string): string[] {
  return normalizeIgnoredDirs((value || "").split(/\r?\n/));
}

export function normalizeIgnoredDirs(dirs: string[]): string[] {
  return Array.from(new Set(dirs.map(normalizeIgnoredPath).filter(Boolean)));
}

export function getIgnoredDirForPath(filePath: string, ignoredDirs: string[]): string | null {
  const normalizedPath = normalizeIgnoredPath(filePath);
  if (!normalizedPath) {
    return null;
  }

  return (
    normalizeIgnoredDirs(ignoredDirs).find(
      (dir) => normalizedPath === dir || normalizedPath.startsWith(`${dir}/`)
    ) ?? null
  );
}
