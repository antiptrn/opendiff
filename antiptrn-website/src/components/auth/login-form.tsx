import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SiGithub, SiGoogle } from "@icons-pack/react-simple-icons";
import { useAuth } from "@/contexts/auth-context";

interface LoginFormProps extends React.ComponentProps<"form"> {
  addAccount?: boolean;
  redirectUrl?: string | null;
}

export function LoginForm({ className, addAccount, redirectUrl, ...props }: LoginFormProps) {
  const { login, loginWithGoogle, setAddingAccount } = useAuth();

  const handleGitHubLogin = () => {
    if (addAccount) {
      setAddingAccount();
    }
    login(redirectUrl || undefined);
  };

  const handleGoogleLogin = () => {
    if (addAccount) {
      setAddingAccount();
    }
    loginWithGoogle(redirectUrl || undefined);
  };

  return (
    <form className={cn("flex flex-col gap-3 w-full max-w-sm mx-auto", className)} {...props}>
      <Button
        size="lg"
        variant="outline"
        type="button"
        className="w-full rounded-full"
        onClick={handleGitHubLogin}
      >
        <SiGithub className="size-4" />
        {addAccount ? "Add GitHub account" : "Login with GitHub"}
      </Button>
      <Button
        size="lg"
        variant="outline"
        type="button"
        className="w-full rounded-full"
        onClick={handleGoogleLogin}
      >
        <SiGoogle className="size-4" />
        {addAccount ? "Add Google account" : "Login with Google"}
      </Button>
    </form>
  );
}
