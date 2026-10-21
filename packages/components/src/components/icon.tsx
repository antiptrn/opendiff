interface Props {
  size?: "default" | "lg";
}

export function Icon({ size = "default" }: Props) {
  return (
    <svg
      className={size === "lg" ? "size-6 text-foreground" : "size-4.5 text-foreground"}
      fill="var(--yellow)"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1500 1500"
      role="presentation"
      aria-hidden="true"
    >
      <rect width="1500" height="1500" />
      <path className="fill-black" d="M750 0L1125 375L750 750L1125 1125L750 1500L0 750Z" />
    </svg>
  );
}
