import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SETTINGS_API_URL = process.env.SETTINGS_API_URL || "http://localhost:3000";
const REVIEW_AGENT_API_KEY = process.env.REVIEW_AGENT_API_KEY || "";

interface SkillResource {
  id: string;
  path: string;
  content: string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  resources: SkillResource[];
}

export interface RepoSkill {
  name: string;
  description: string;
  content: string;
  source: "repo";
}

/**
 * Fetch user skills from the server API for a given repo's organization.
 */
async function fetchSkillsForRepo(owner: string, repo: string): Promise<Skill[]> {
  try {
    const headers: Record<string, string> = {};
    if (REVIEW_AGENT_API_KEY) {
      headers["X-API-Key"] = REVIEW_AGENT_API_KEY;
    }

    const response = await fetch(`${SETTINGS_API_URL}/api/internal/skills/${owner}/${repo}`, {
      headers,
    });

    if (!response.ok) return [];

    const data = (await response.json()) as { skills: Skill[] };
    return data.skills || [];
  } catch (error) {
    console.warn("Failed to fetch skills for hydration:", error);
    return [];
  }
}

/**
 * Write user skills to the workspace's OpenCode skills directory (.claude/skills/).
 * User skills are prefixed with `user--` to avoid collisions with repo skills.
 */
export async function hydrateSkills(
  owner: string,
  repo: string,
  workspacePath: string
): Promise<void> {
  const skills = await fetchSkillsForRepo(owner, repo);
  if (skills.length === 0) return;

  const skillsDir = join(workspacePath, ".claude", "skills");
  await mkdir(skillsDir, { recursive: true });

  for (const skill of skills) {
    const dir = join(skillsDir, `user--${skill.name}`);
    await mkdir(dir, { recursive: true });

    // Write SKILL.md with frontmatter
    const skillMd = [
      "---",
      `name: ${skill.name}`,
      `description: ${skill.description}`,
      "---",
      "",
      skill.content,
    ].join("\n");

    await writeFile(join(dir, "SKILL.md"), skillMd);

    // Write bundled resources
    for (const resource of skill.resources) {
      const resourcePath = join(dir, resource.path);
      await mkdir(dirname(resourcePath), { recursive: true });
      await writeFile(resourcePath, resource.content);
    }
  }
}

/**
 * Remove only user-hydrated skill directories (user--*) from the workspace.
 * Repo skills are left untouched.
 */
export async function cleanupUserSkills(workspacePath: string): Promise<void> {
  const skillsDir = join(workspacePath, ".claude", "skills");
  try {
    const entries = await readdir(skillsDir);
    for (const entry of entries) {
      if (entry.startsWith("user--")) {
        await rm(join(skillsDir, entry), { recursive: true, force: true });
      }
    }
  } catch {
    // Directory doesn't exist or already cleaned up
  }
}

/**
 * Detect repo-owned skills from the workspace's OpenCode skills directory (.claude/skills/).
 * Skips user-hydrated skills (prefixed with user--).
 */
export async function detectRepoSkills(workspacePath: string): Promise<RepoSkill[]> {
  const skillsDir = join(workspacePath, ".claude", "skills");
  const repoSkills: RepoSkill[] = [];

  try {
    const entries = await readdir(skillsDir);

    for (const entry of entries) {
      if (entry.startsWith("user--")) continue;

      const skillMdPath = join(skillsDir, entry, "SKILL.md");
      try {
        const content = await readFile(skillMdPath, "utf-8");
        const { name, description, body } = parseFrontmatter(content);
        repoSkills.push({
          name: name || entry,
          description: description || "",
          content: body,
          source: "repo",
        });
      } catch {
        // No SKILL.md in this directory, skip
      }
    }
  } catch {
    // No skills directory
  }

  return repoSkills;
}

function parseFrontmatter(content: string): {
  name: string;
  description: string;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { name: "", description: "", body: content };
  }

  const frontmatter = match[1];
  const body = match[2].trim();

  let name = "";
  let description = "";

  for (const line of frontmatter.split("\n")) {
    const nameMatch = line.match(/^name:\s*(.+)/);
    if (nameMatch) name = nameMatch[1].trim();

    const descMatch = line.match(/^description:\s*(.+)/);
    if (descMatch) description = descMatch[1].trim();
  }

  return { name, description, body };
}
