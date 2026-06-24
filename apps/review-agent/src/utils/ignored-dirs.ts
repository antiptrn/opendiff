function normalizeIgnoredPathPattern(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) {
    return "";
  }

  const withoutTrailingSlashes = normalized.replace(/\/+$/, "");
  if (!withoutTrailingSlashes) {
    return "";
  }

  return withoutTrailingSlashes.length !== normalized.length
    ? `${withoutTrailingSlashes}/*`
    : withoutTrailingSlashes;
}

function normalizeFilePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesIgnoredPathPattern(filePath: string, pattern: string): boolean {
  const normalizedPath = normalizeFilePath(filePath);
  const normalizedPattern = normalizeIgnoredPathPattern(pattern);

  if (!normalizedPath || !normalizedPattern) {
    return false;
  }

  if (!normalizedPattern.includes("*")) {
    return normalizedPath === normalizedPattern;
  }

  const regex = new RegExp(`^${normalizedPattern.split("*").map(escapeRegExp).join(".*")}$`);
  return regex.test(normalizedPath);
}

export function parseIgnoredDirs(value?: string): string[] {
  return normalizeIgnoredDirs((value || "").split(/\r?\n/));
}

export function normalizeIgnoredDirs(dirs: string[]): string[] {
  return Array.from(new Set(dirs.map(normalizeIgnoredPathPattern).filter(Boolean)));
}

export function getIgnoredDirForPath(filePath: string, ignoredDirs: string[]): string | null {
  const normalizedPath = normalizeFilePath(filePath);
  if (!normalizedPath) {
    return null;
  }

  return (
    normalizeIgnoredDirs(ignoredDirs).find((pattern) =>
      matchesIgnoredPathPattern(normalizedPath, pattern)
    ) ?? null
  );
}
