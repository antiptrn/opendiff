import { describe, expect, it } from "vitest";
import { getIgnoredDirForPath, parseIgnoredDirs } from "./ignored-dirs";

describe("ignored directory matching", () => {
  it("parses newline-separated directory settings", () => {
    expect(parseIgnoredDirs(" generated \n/vendor/\n\napps\\legacy\nvendor")).toEqual([
      "generated",
      "vendor",
      "apps/legacy",
    ]);
  });

  it("matches files directly under ignored directories", () => {
    expect(getIgnoredDirForPath("generated/client.ts", ["generated"])).toBe("generated");
    expect(getIgnoredDirForPath("/vendor/pkg/a.ts", ["vendor/"])).toBe("vendor");
  });

  it("does not match unrelated paths that only contain the ignored directory name", () => {
    expect(getIgnoredDirForPath("src/generated.ts", ["generated"])).toBeNull();
    expect(getIgnoredDirForPath("src/vendor/file.ts", ["vendor"])).toBeNull();
  });
});
