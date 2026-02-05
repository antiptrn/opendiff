import type { OrgRepository } from "@/features/repositories";
import { motion } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";
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
} from "opendiff-components/components/ui/alert-dialog";
import { Button } from "opendiff-components/components/ui/button";
import { useState } from "react";
import { RepoListItem } from "./repo-list-item";

// Local storage key for tracking last opened repositories
const LAST_OPENED_KEY = "opendiff_repo_last_opened";

export function getLastOpenedTimes(): Record<string, number> {
  try {
    const stored = localStorage.getItem(LAST_OPENED_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function setLastOpenedTime(fullName: string): void {
  try {
    const times = getLastOpenedTimes();
    times[fullName] = Date.now();
    localStorage.setItem(LAST_OPENED_KEY, JSON.stringify(times));
  } catch {
    // Ignore storage errors
  }
}

interface ActiveRepoCardProps {
  settings: OrgRepository;
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * Card displaying an active repository in the list
 */
export function ActiveRepoCard({ settings, onEdit, onDelete }: ActiveRepoCardProps) {
  const fullName = settings.fullName || `${settings.owner}/${settings.repo}`;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="py-4 select-none transition-opacity duration-150 group-hover/repo-list:opacity-40 hover:!opacity-100"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <RepoListItem name={fullName}>
        {(onEdit || onDelete) && (
          <motion.div
            initial={false}
            animate={{
              x: hovered ? 0 : -8,
              opacity: hovered ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2"
            style={{ pointerEvents: hovered ? "auto" : "none" }}
          >
            {onEdit && (
              <Button size="icon" variant="secondary" onClick={onEdit}>
                <Pencil className="size-4" />
              </Button>
            )}
            {onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="secondary">
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove Repository</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to remove {fullName}? This will disable all reviews and
                      triage for this repository.
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
            )}
          </motion.div>
        )}
      </RepoListItem>
    </div>
  );
}
