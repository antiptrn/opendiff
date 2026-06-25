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

  return getEquivalentPathPatterns(normalizedPattern).some((candidatePattern) =>
    matchesNormalizedIgnoredPathPattern(normalizedPath, candidatePattern)
  );
}

function matchesNormalizedIgnoredPathPattern(
  normalizedPath: string,
  normalizedPattern: string
): boolean {
  if (!normalizedPattern.includes("*")) {
    return (
      normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`)
    );
  }

  const regex = new RegExp(`^${normalizedPattern.split("*").map(escapeRegExp).join(".*")}$`);
  return regex.test(normalizedPath);
}

function getEquivalentPathPatterns(normalizedPattern: string): string[] {
  const patterns = [normalizedPattern];
  const workspaceSourceMatch = normalizedPattern.match(
    /^src\/(apps|packages)\/([^/]+)(?:\/(.*))?$/
  );

  if (workspaceSourceMatch) {
    const [, workspaceDir, workspaceName, rest] = workspaceSourceMatch;
    patterns.push(
      rest ? `${workspaceDir}/${workspaceName}/src/${rest}` : `${workspaceDir}/${workspaceName}/src`
    );
  }

  return Array.from(new Set(patterns));
}

export function parsePathPatterns(value?: string): string[] {
  return normalizePathPatterns((value || "").split(/\r?\n/));
}

export function parseIgnoredDirs(value?: string): string[] {
  return parsePathPatterns(value);
}

export function normalizePathPatterns(dirs: string[]): string[] {
  return Array.from(new Set(dirs.map(normalizeIgnoredPathPattern).filter(Boolean)));
}

export function normalizeIgnoredDirs(dirs: string[]): string[] {
  return normalizePathPatterns(dirs);
}

export function getPathPatternForPath(filePath: string, patterns: string[]): string | null {
  const normalizedPath = normalizeFilePath(filePath);
  if (!normalizedPath) {
    return null;
  }

  return (
    normalizePathPatterns(patterns).find((pattern) =>
      matchesIgnoredPathPattern(normalizedPath, pattern)
    ) ?? null
  );
}

export function getIgnoredDirForPath(filePath: string, ignoredDirs: string[]): string | null {
  return getPathPatternForPath(filePath, ignoredDirs);
}
