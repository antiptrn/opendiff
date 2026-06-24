export function getBotMentionAliases(botUsername: string): string[] {
  const aliases = new Set([botUsername, "opendiff"].filter(Boolean));
  return [...aliases];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function commentMentionsBot(body: string | undefined, botUsername: string): boolean {
  if (!body) {
    return false;
  }

  return getBotMentionAliases(botUsername).some((alias) => {
    const mentionPattern = new RegExp(`(^|\\s)@${escapeRegex(alias)}(?=$|\\s|[^\\w-])`, "i");
    return mentionPattern.test(body);
  });
}

export function isBareBotMention(body: string | undefined, botUsername: string): boolean {
  if (!body) {
    return false;
  }

  const normalized = body.trim().replace(/\s+/g, " ").toLowerCase();
  return getBotMentionAliases(botUsername).some(
    (alias) => normalized === `@${alias.toLowerCase()}`
  );
}
