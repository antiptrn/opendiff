import type { OrgRepository } from "@/features/repositories";
import { Delete02Icon, EllipsisVerticalIcon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
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
} from "components/components/ui/alert-dialog";
import { Button } from "components/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "components/components/ui/dropdown-menu";
import { useState } from "react";

interface RepoRowActionsProps {
  repository: OrgRepository;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * A row's actions menu in the repositories table: edit or remove. Removing asks for confirmation
 * first, since it turns off reviews for the repository.
 */
export function RepoRowActions({ repository, onEdit, onDelete }: RepoRowActionsProps) {
  const fullName = repository.fullName || `${repository.owner}/${repository.repo}`;
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  return (
    // Clicks here shouldn't also open the row
    // biome-ignore lint/a11y/noStaticElementInteractions: only stops the click reaching the row
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users reach the menu button directly
    <div className="flex items-center justify-end" onClick={(event) => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Shaped like the sidebar's collapse button: a small rounded square, icon muted until hover */}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Actions for ${fullName}`}
            className="!rounded-sm text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={EllipsisVerticalIcon} className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmingRemove(true)}>
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmingRemove} onOpenChange={setConfirmingRemove}>
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
