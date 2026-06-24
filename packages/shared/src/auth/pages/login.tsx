import { Logo } from "components/components";
import { Loader2 } from "lucide-react";
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
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </section>
    );
  }

  // Only redirect if logged in AND not adding an account
  if (user && !addAccount) {
    return <Navigate to={afterAuthUrl} replace />;
  }

  const isVerificationLoading = verificationStatus === "loading";

  return (
    <section className="relative p-8 flex flex-col items-center justify-center h-screen w-screen bg-card dark:bg-background">
      {isVerificationLoading && <Loader2 className="size-8 animate-spin text-muted-foreground" />}
      <div
        className={
          isVerificationLoading
            ? "pointer-events-none absolute opacity-0"
            : "flex w-full flex-col items-center"
        }
        aria-hidden={isVerificationLoading}
        inert={isVerificationLoading ? true : undefined}
      >
        <Link to={import.meta.env.VITE_WEBSITE_URL || "/"} className="mb-6">
          <Logo />
        </Link>
        {error && (
          <div className="text-red-500 mb-4 text-center max-w-md">
            {errorMessage || `Authentication error: ${error.replace(/_/g, " ")}`}
          </div>
        )}
        <LoginForm
          addAccount={addAccount}
          redirectUrl={redirectUrl}
          onVerificationStatusChange={setVerificationStatus}
        />
      </div>
    </section>
  );
}
