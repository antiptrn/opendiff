import { useLinkGitHub, useUnlinkGitHub } from "@/features/settings";
import { SettingsRow } from "components/components/console";
import { LoadingButton } from "components/components/ui/loading-button";
import { toast } from "sonner";

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
