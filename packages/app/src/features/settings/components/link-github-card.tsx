import { useLinkGitHub, useUnlinkGitHub } from "@/features/settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { LoadingButton } from "components/components/ui/loading-button";
import { toast } from "sonner";

interface LinkGitHubCardProps {
  token?: string;
  isLinked?: boolean;
  onUnlinked?: () => void;
}

/**
 * Card component for linking/unlinking GitHub account (for Google users)
 */
export function LinkGitHubCard({ token, isLinked, onUnlinked }: LinkGitHubCardProps) {
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

  if (isLinked) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>GitHub Account</CardTitle>
          <CardDescription>
            Your GitHub account is linked. You can unlink it if you no longer want to use it for
            code reviews.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoadingButton
            variant="outline"
            onClick={handleUnlinkGitHub}
            isLoading={unlinkGitHub.isPending}
          >
            Unlink GitHub Account
          </LoadingButton>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>GitHub Account</CardTitle>
        <CardDescription>
          Link your GitHub account to access your repositories and enable code reviews.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoadingButton onClick={handleLinkGitHub} isLoading={linkGitHub.isPending}>
          Link GitHub Account
        </LoadingButton>
      </CardContent>
    </Card>
  );
}
