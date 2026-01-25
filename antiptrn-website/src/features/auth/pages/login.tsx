import { useSearchParams, Navigate, Link } from "react-router-dom";
import { LoginForm, useAuth } from "@features/auth";
import { Loader2 } from "lucide-react";
import { Logo } from "@shared/components/logo";

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
  const errorMessage = searchParams.get("message");
  const addAccount = searchParams.get("addAccount") === "true";
  const redirectUrl = searchParams.get("redirectUrl");
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <section className="w-screen h-screen flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </section>
    );
  }

  // Only redirect if logged in AND not adding an account
  if (user && !addAccount) {
    return <Navigate to="/console" replace />;
  }

  return (
    <section className="p-8 flex flex-col items-center justify-center h-screen w-screen">
      <Link to="/" className="mb-4">
        <Logo />
      </Link>
      {error && (
        <div className="text-red-500 mb-4 text-center max-w-md">
          {errorMessage || `Authentication error: ${error.replace(/_/g, " ")}`}
        </div>
      )}
      <LoginForm addAccount={addAccount} redirectUrl={redirectUrl} />
    </section>
  );
}
