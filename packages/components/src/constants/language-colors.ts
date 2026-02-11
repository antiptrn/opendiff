/**
 * GitHub language colors (subset of common languages)
 */
export const languageColors: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Java: "#b07219",
  Go: "#00ADD8",
  Rust: "#dea584",
  Ruby: "#701516",
  PHP: "#4F5D95",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Vue: "#41b883",
  Svelte: "#ff3e00",
};

/**
 * Get the color for a programming language
 * @param language The language name
 * @returns The hex color code
 */
export function getLanguageColor(language: string): string {
  return languageColors[language] || "#8b8b8b";
}
