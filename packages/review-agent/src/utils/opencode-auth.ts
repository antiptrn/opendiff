import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

type SupportedProvider = "openai" | "anthropic";

interface OpencodeAuthEntry {
  type?: string;
  access?: string;
  refresh?: string;
  accountId?: string;
  expires?: number;
}

interface OpencodeAuthFile {
  openai?: OpencodeAuthEntry;
  anthropic?: OpencodeAuthEntry;
}

export interface OpencodeOauthCredentials {
  accessToken: string;
  refreshToken?: string;
  accountId?: string;
  expires?: number;
}

export function resolveOpencodeAuthPath(): string {
  const explicitPath = process.env.OPENCODE_AUTH_PATH?.trim();
  if (explicitPath) {
    return explicitPath;
  }

  const xdgDataHome = process.env.XDG_DATA_HOME?.trim();
  if (xdgDataHome) {
    return path.join(xdgDataHome, "opencode", "auth.json");
  }

  return path.join(os.homedir(), ".local", "share", "opencode", "auth.json");
}

export function loadOpencodeOauthCredentials(
  provider: SupportedProvider
): OpencodeOauthCredentials | null {
  const authPath = resolveOpencodeAuthPath();
  if (!fs.existsSync(authPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(authPath, "utf8");
    const parsed = JSON.parse(raw) as OpencodeAuthFile;
    const entry = parsed[provider];

    if (!entry?.access) {
      return null;
    }

    return {
      accessToken: entry.access,
      ...(entry.refresh ? { refreshToken: entry.refresh } : {}),
      ...(entry.accountId ? { accountId: entry.accountId } : {}),
      ...(typeof entry.expires === "number" ? { expires: entry.expires } : {}),
    };
  } catch (error) {
    console.warn(`Failed to read OpenCode auth credentials for ${provider}:`, error);
    return null;
  }
}
