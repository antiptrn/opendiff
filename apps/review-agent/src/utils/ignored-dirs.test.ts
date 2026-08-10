import { describe, expect, it } from "vitest";
import { getIgnoredDirForPath, getPathPatternForPath, parseIgnoredDirs } from "./ignored-dirs";

describe("ignored path pattern matching", () => {
  it("parses newline-separated path pattern settings", () => {
    expect(parseIgnoredDirs(" generated/* \n/vendor/\n\napps\\legacy\\*\nREADME.md")).toEqual([
      "generated/*",
      "vendor/*",
      "apps/legacy/*",
      "README.md",
    ]);
  });

  it("deduplicates equivalent repeated path patterns", () => {
    expect(parseIgnoredDirs("vendor/\nvendor/*\n/vendor/")).toEqual(["vendor/*"]);
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

  it("matches workspace source path patterns against monorepo app and package paths", () => {
    expect(getIgnoredDirForPath("apps/site/src/app.tsx", ["src/apps/site/*"])).toBe(
      "src/apps/site/*"
    );
    expect(
      getIgnoredDirForPath("apps/site/src/components/marketing/hero-section.tsx", [
        "src/apps/site/*",
      ])
    ).toBe("src/apps/site/*");
    expect(
      getIgnoredDirForPath("packages/shared/src/auth/index.ts", ["src/packages/shared/*"])
    ).toBe("src/packages/shared/*");
    expect(getIgnoredDirForPath("apps/site/public/robots.txt", ["src/apps/site/*"])).toBeNull();
  });

  it("matches workspace patterns that explicitly include the src directory", () => {
    expect(
      getIgnoredDirForPath("apps/site/src/components/marketing/hero-section.tsx", [
        "src/apps/site/src/components/*",
      ])
    ).toBe("src/apps/site/src/components/*");
    expect(
      getIgnoredDirForPath("apps/site/src/src/components/marketing/hero-section.tsx", [
        "src/apps/site/src/components/*",
      ])
    ).toBeNull();
  });

  it("matches include path patterns with the same wildcard behavior", () => {
    expect(getPathPatternForPath("apps/app/src/main.tsx", ["src/apps/app/*"])).toBe(
      "src/apps/app/*"
    );
    expect(
      getPathPatternForPath("apps/site/src/components/marketing/hero-section.tsx", [
        "src/apps/site/src/components/*",
      ])
    ).toBe("src/apps/site/src/components/*");
    expect(getPathPatternForPath("apps/app/public/robots.txt", ["src/apps/app/*"])).toBeNull();
    expect(
      getPathPatternForPath("packages/shared/src/types/index.ts", ["packages/shared/src/*"])
    ).toBe("packages/shared/src/*");
  });

  it("treats bare path entries as exact matches and legacy directory prefixes", () => {
    expect(getIgnoredDirForPath("generated", ["generated"])).toBe("generated");
    expect(getIgnoredDirForPath("generated/client.ts", ["generated"])).toBe("generated");
    expect(getIgnoredDirForPath("src/generated.ts", ["generated"])).toBeNull();
    expect(getIgnoredDirForPath("src/apps/bff.ts", ["src/apps/bff/*"])).toBeNull();
  });
});
