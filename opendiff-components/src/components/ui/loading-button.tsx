import { type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./button";
import { buttonVariants } from "./button.variants";

interface LoadingButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  /** Whether the button is in a loading state */
  isLoading?: boolean;
  /** Text to show when loading (defaults to children) */
  loadingText?: ReactNode;
  /** Icon to show before the text (hidden when loading) */
  icon?: ReactNode;
  /** Position of the spinner: "left" (default) or "right" */
  spinnerPosition?: "left" | "right";
}

/**
 * Button with built-in loading state
 *
 * @example
 * // Basic usage
 * <LoadingButton isLoading={isPending}>Save</LoadingButton>
 *
 * @example
 * // With loading text
 * <LoadingButton isLoading={isPending} loadingText="Saving...">Save</LoadingButton>
 *
 * @example
 * // With icon
 * <LoadingButton isLoading={isPending} icon={<Plus className="size-4" />}>Add Item</LoadingButton>
 */
function LoadingButton({
  children,
  isLoading = false,
  loadingText,
  icon,
  spinnerPosition = "left",
  disabled,
  ...props
}: LoadingButtonProps) {
  const spinner = <Loader2 className="size-4 animate-spin" />;
  const displayText = isLoading && loadingText ? loadingText : children;

  return (
    <Button disabled={disabled || isLoading} {...props}>
      {isLoading && spinnerPosition === "left" && spinner}
      {!isLoading && icon}
      {displayText}
      {isLoading && spinnerPosition === "right" && spinner}
    </Button>
  );
}

export { LoadingButton };
