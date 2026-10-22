import type { OrgRepository } from "@/features/repositories";
import { Delete02Icon, PencilIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "components/components/ui/alert-dialog";
import { Button } from "components/components/ui/button";

interface RepoRowActionsProps {
  repository: OrgRepository;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Edit and remove buttons for a row of the repositories table. Removing asks for confirmation
 * first, since it turns off reviews for the repository.
 */
export function RepoRowActions({ repository, onEdit, onDelete }: RepoRowActionsProps) {
  const fullName = repository.fullName || `${repository.owner}/${repository.repo}`;

  return (
    // Clicks here shouldn't also open the row
    // biome-ignore lint/a11y/noStaticElementInteractions: only stops the click reaching the row
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users reach the buttons directly
    <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${fullName}`} onClick={onEdit}>
        <HugeiconsIcon icon={PencilIcon} className="size-4" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${fullName}`}>
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Repository</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {fullName}? This will disable all reviews and triage
              for this repository.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction variant="outline" onClick={onDelete}>
              Remove
            </AlertDialogAction>
            <AlertDialogCancel variant="default">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
