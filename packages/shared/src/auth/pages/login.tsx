import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Icon } from "components/components";
import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useNavigationConfig } from "../../navigation";
import { LoginForm } from "../components/login-form";
import { useAuth } from "../hooks/use-auth";

type LoginVerificationStatus = "loading" | "ready" | "error";

/** Login page that shows authentication options or redirects authenticated users to the app. */
export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const errorMessage = searchParams.get("message");
  const addAccount = searchParams.get("addAccount") === "true";
  const redirectUrl = searchParams.get("redirectUrl");
  const { user, isLoading } = useAuth();
  const { afterAuthUrl } = useNavigationConfig();
  const isTurnstileRequired =
    !import.meta.env.DEV && !!import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  const [verificationStatus, setVerificationStatus] = useState<LoginVerificationStatus>(
    isTurnstileRequired ? "loading" : "ready"
  );

  if (isLoading) {
    return (
      <section className="w-screen h-screen flex items-center justify-center">
        <HugeiconsIcon icon={Loading03Icon} className="size-8 animate-spin text-muted-foreground" />
      </section>
    );
  }

  // Only redirect if logged in AND not adding an account
  if (user && !addAccount) {
    return <Navigate to={afterAuthUrl} replace />;
  }

  const isVerificationLoading = verificationStatus === "loading";

  const websiteUrl = import.meta.env.VITE_WEBSITE_URL || "/";

  return (
    <section className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background px-8 py-16">
      {isVerificationLoading && (
        <HugeiconsIcon icon={Loading03Icon} className="size-8 animate-spin text-muted-foreground" />
      )}
      <div
        className={
          isVerificationLoading
            ? "pointer-events-none absolute opacity-0"
            : "relative z-10 flex w-full max-w-[380px] flex-col items-center text-center"
        }
        aria-hidden={isVerificationLoading}
        inert={isVerificationLoading ? true : undefined}
      >
        <Link to={websiteUrl} aria-label="Home">
          <Icon size="lg" />
        </Link>
        <p className="mt-6 mb-6 text-xl font-medium tracking-tight text-foreground">Sign in or create your account</p>
        {error && (
          <div className="mb-4 text-center text-destructive">
            {errorMessage || `Authentication error: ${error.replace(/_/g, " ")}`}
          </div>
        )}
        <LoginForm
          addAccount={addAccount}
          redirectUrl={redirectUrl}
          onVerificationStatusChange={setVerificationStatus}
        />
        <p className="mt-8 text-sm leading-[1.5] text-balance text-muted-foreground">
          By signing in, you agree to our{" "}
          <a href={`${websiteUrl}/terms`} className="underline underline-offset-4 hover:text-foreground">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href={`${websiteUrl}/privacy`} className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </section>
  );
}
