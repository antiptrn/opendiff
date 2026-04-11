/** Navigation link with optional badge */
export interface NavLink {
  label: string;
  href: string;
  badge?: string;
}

/** Position and dimensions for the hover indicator */
export interface HoverStyle {
  left: number;
  width: number;
}
