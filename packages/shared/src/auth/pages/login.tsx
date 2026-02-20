import { Logo } from "components/components";
import { Loader2 } from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useNavigationConfig } from "../../navigation";
import { LoginForm } from "../components/login-form";
import { useAuth } from "../hooks/use-auth";

/** Login page that shows authentication options or redirects authenticated users to the app. */
export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const errorMessage = searchParams.get("message");
  const addAccount = searchParams.get("addAccount") === "true";
  const redirectUrl = searchParams.get("redirectUrl");
  const { user, isLoading } = useAuth();
  const { afterAuthUrl } = useNavigationConfig();

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

  return (
    <section className="p-8 flex flex-col items-center justify-center h-screen w-screen bg-card dark:bg-background">
      <Link to={import.meta.env.VITE_WEBSITE_URL || "/"} className="mb-6">
        <Logo />
      </Link>
      {error && (
        <div className="text-red-500 mb-4 text-center max-w-md">
          {errorMessage || `Authentication error: ${error.replace(/_/g, " ")}`}
        </div>
      )}
      <LoginForm addAccount={addAccount} redirectUrl={redirectUrl} />
      <div className="fixed bottom-0 left-0 right-0 flex items-center justify-center p-8 gap-4">
        <p className="text-xs text-muted-foreground">
          By signing in you agree to our <Link to={`${import.meta.env.VITE_WEBSITE_URL}/terms`} className="text-muted-foreground hover:text-primary underline underline-offset-3">Terms of service</Link> and <Link to={`${import.meta.env.VITE_WEBSITE_URL}/privacy`} className="text-muted-foreground hover:text-primary underline underline-offset-3">Privacy policy</Link>.
        </p>
      </div>
    </section>
  );
}
