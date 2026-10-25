import { useLinkGitHub, useUnlinkGitHub } from "@/features/settings";
import { SettingsRow } from "components/components/console";
import { LoadingButton } from "components/components/ui/loading-button";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

/** What went wrong when GitHub sends someone back here after a failed link, by error code */
const LINK_ERRORS: Record<string, string> = {
  github_already_linked:
    "That GitHub account is already connected to another Contrast account. Sign in with GitHub to use it, or unlink it from that account first.",
  github_link_failed: "GitHub didn't finish connecting. Try again.",
  user_not_found: "We couldn't find your account to connect GitHub to. Sign in again and retry.",
};

interface LinkGitHubRowProps {
  token?: string;
  isLinked?: boolean;
  onUnlinked?: () => void;
}

/**
 * Settings row for linking/unlinking a GitHub account (for Google and Microsoft users)
 */
export function LinkGitHubRow({ token, isLinked, onUnlinked }: LinkGitHubRowProps) {
  const linkGitHub = useLinkGitHub(token);
  const unlinkGitHub = useUnlinkGitHub(token);
  const [searchParams, setSearchParams] = useSearchParams();

  // Explain a failed link once, then drop the code from the URL so a reload doesn't repeat it
  useEffect(() => {
    const code = searchParams.get("error");
    if (!code || !(code in LINK_ERRORS)) return;
    toast.error(LINK_ERRORS[code]);
    const next = new URLSearchParams(searchParams);
    next.delete("error");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleLinkGitHub = async () => {
    try {
      const { url } = await linkGitHub.mutateAsync();
      window.location.href = url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to link GitHub account");
    }
  };

  const handleUnlinkGitHub = async () => {
    try {
      await unlinkGitHub.mutateAsync();
      toast.success("GitHub account unlinked");
      onUnlinked?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to unlink GitHub account");
    }
  };

  return (
    <SettingsRow
      title="GitHub account"
      description={
        isLinked
          ? "Linked. Unlink it if you no longer want to use it for code reviews."
          : "Link your GitHub account to access your repositories and enable code reviews."
      }
    >
      {isLinked ? (
        <LoadingButton
          variant="outline"
          onClick={handleUnlinkGitHub}
          isLoading={unlinkGitHub.isPending}
        >
          Unlink
        </LoadingButton>
      ) : (
        <LoadingButton onClick={handleLinkGitHub} isLoading={linkGitHub.isPending}>
          Link GitHub
        </LoadingButton>
      )}
    </SettingsRow>
  );
}
