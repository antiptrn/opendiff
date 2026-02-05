/** Renders a unified diff with colored lines */
export function DiffBlock({ diff }: { diff: string }) {
  const lines = diff.split("\n");

  return (
    <pre className="text-xs overflow-x-auto rounded border font-mono">
      {lines.map((line, i) => {
        let className = "block px-3 py-px text-muted-foreground";

        if (line.startsWith("@@")) {
          className = "block px-3 py-px bg-blue-950/20 text-blue-400";
        } else if (line.startsWith("+")) {
          className =
            "block px-3 py-px bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400";
        } else if (line.startsWith("-")) {
          className =
            "block px-3 py-px bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400";
        }

        return (
          <span key={`${i}-${line.slice(0, 20)}`} className={className}>
            {line}
          </span>
        );
      })}
    </pre>
  );
}
