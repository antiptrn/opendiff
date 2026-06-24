import { describe, expect, it } from "vitest";
import { getIgnoredDirForPath, parseIgnoredDirs } from "./ignored-dirs";

describe("ignored path pattern matching", () => {
  it("parses newline-separated path pattern settings", () => {
    expect(parseIgnoredDirs(" generated/* \n/vendor/\n\napps\\legacy\\*\nREADME.md")).toEqual([
      "generated/*",
      "vendor/*",
      "apps/legacy/*",
      "README.md",
    ]);
  });

  it("matches exact file paths at the repository root", () => {
    expect(getIgnoredDirForPath("README.md", ["README.md"])).toBe("README.md");
    expect(getIgnoredDirForPath("/README.md", ["README.md"])).toBe("README.md");
    expect(getIgnoredDirForPath("docs/README.md", ["README.md"])).toBeNull();
  });

  it("matches wildcard directory patterns recursively", () => {
    expect(getIgnoredDirForPath("src/apps/bff/index.ts", ["src/apps/bff/*"])).toBe(
      "src/apps/bff/*"
    );
    expect(getIgnoredDirForPath("src/apps/bff/routes/index.ts", ["src/apps/bff/*"])).toBe(
      "src/apps/bff/*"
    );
    expect(getIgnoredDirForPath("/vendor/pkg/a.ts", ["vendor/"])).toBe("vendor/*");
  });

  it("treats bare path entries as exact matches and legacy directory prefixes", () => {
    expect(getIgnoredDirForPath("generated", ["generated"])).toBe("generated");
    expect(getIgnoredDirForPath("generated/client.ts", ["generated"])).toBe("generated");
    expect(getIgnoredDirForPath("src/generated.ts", ["generated"])).toBeNull();
    expect(getIgnoredDirForPath("src/apps/bff.ts", ["src/apps/bff/*"])).toBeNull();
  });
});
