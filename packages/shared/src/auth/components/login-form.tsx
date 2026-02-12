import { SiGithub } from "@icons-pack/react-simple-icons";
import { Loader2 } from "lucide-react";
import { Button } from "components/components/ui/button";
import { cn } from "components/utils";
import { useState } from "react";
import { useAuth } from "../hooks/use-auth";

type LoginProvider = "github" | "google" | "microsoft" | null;

interface LoginFormProps extends React.ComponentProps<"form"> {
  addAccount?: boolean;
  redirectUrl?: string | null;
}

/** Renders login buttons for GitHub, Google, and Microsoft authentication providers. */
export function LoginForm({ className, addAccount, redirectUrl, ...props }: LoginFormProps) {
  const { login, loginWithGoogle, loginWithMicrosoft, setAddingAccount } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<LoginProvider>(null);

  const handleGitHubLogin = () => {
    setLoadingProvider("github");
    if (addAccount) {
      setAddingAccount();
    }
    login(redirectUrl || undefined);
  };

  const handleGoogleLogin = () => {
    setLoadingProvider("google");
    if (addAccount) {
      setAddingAccount();
    }
    loginWithGoogle(redirectUrl || undefined);
  };

  const handleMicrosoftLogin = () => {
    setLoadingProvider("microsoft");
    if (addAccount) {
      setAddingAccount();
    }
    loginWithMicrosoft(redirectUrl || undefined);
  };

  const isLoading = loadingProvider !== null;

  return (
    <form className={cn("flex flex-col gap-3 w-full max-w-sm mx-auto", className)} {...props}>
      <Button
        size="lg"
        variant="secondary"
        type="button"
        className="w-full"
        onClick={handleGitHubLogin}
        disabled={isLoading}
      >
        {loadingProvider === "github" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <SiGithub className="size-4" />
        )}
        {addAccount ? "Add GitHub account" : "Login with GitHub"}
      </Button>
      <Button
        size="lg"
        variant="secondary"
        type="button"
        className="w-full"
        onClick={handleGoogleLogin}
        disabled={isLoading}
      >
        {loadingProvider === "google" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <img src="/icons/google-icon.svg" alt="" className="size-4" />
        )}
        {addAccount ? "Add Google account" : "Login with Google"}
      </Button>
      <Button
        size="lg"
        variant="secondary"
        type="button"
        className="w-full"
        onClick={handleMicrosoftLogin}
        disabled={isLoading}
      >
        {loadingProvider === "microsoft" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <img src="/icons/microsoft-icon.svg" alt="" className="size-4" />
        )}
        {addAccount ? "Add Microsoft account" : "Login with Microsoft"}
      </Button>
    </form>
  );
}
