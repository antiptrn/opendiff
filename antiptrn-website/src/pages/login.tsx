import { useSearchParams, Navigate, Link } from "react-router-dom";
import { LoginForm } from "@/components/auth/login-form";
import { useAuth } from "@/contexts/auth-context";
import { Loader2 } from "lucide-react";
import Logo from "@/components/logo";

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");
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
        <p className="text-red-500 mb-4">Authentication error: {error.replace(/_/g, " ")}</p>
      )}
      <LoginForm addAccount={addAccount} redirectUrl={redirectUrl} />
    </section>
  );
}
