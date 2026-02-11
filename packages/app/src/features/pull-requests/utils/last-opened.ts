/** Local storage key for tracking last opened repositories */
const LAST_OPENED_KEY = "opendiff_repo_last_opened";

/** Get the last-opened timestamps for all repositories */
export function getLastOpenedTimes(): Record<string, number> {
  try {
    const stored = localStorage.getItem(LAST_OPENED_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/** Record the current time as the last-opened time for a repository */
export function setLastOpenedTime(fullName: string): void {
  try {
    const times = getLastOpenedTimes();
    times[fullName] = Date.now();
    localStorage.setItem(LAST_OPENED_KEY, JSON.stringify(times));
  } catch {
    // Ignore storage errors
  }
}
