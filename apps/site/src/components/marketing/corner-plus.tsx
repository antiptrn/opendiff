/** Small plus drawn over a corner where the grid lines cross */
export function CornerPlus({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={`pointer-events-none absolute size-3 text-yellow ${className}`}
    >
      <path d="M6 0v12M0 6h12" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
