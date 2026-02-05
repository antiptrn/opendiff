import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

interface AlertProps {
  children: ReactNode;
  variant?: "error" | "success";
  className?: string;
}

/**
 * Alert component for displaying error and success messages
 */
export function Alert({ children, variant = "error", className }: AlertProps) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        variant === "error" && "border-destructive/50 bg-destructive/10 text-destructive",
        variant === "success" &&
          "border-green-500/50 bg-green-500/10 text-green-600 dark:bg-green-400/10 dark:text-green-400",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Convenience component for error messages
 */
export function ErrorAlert({ children, className }: Omit<AlertProps, "variant">) {
  return (
    <Alert variant="error" className={className}>
      {children}
    </Alert>
  );
}

/**
 * Convenience component for success messages
 */
export function SuccessAlert({ children, className }: Omit<AlertProps, "variant">) {
  return (
    <Alert variant="success" className={className}>
      {children}
    </Alert>
  );
}
