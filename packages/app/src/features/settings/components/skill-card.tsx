import type { Skill } from "@/features/settings";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "components/components/ui/button";
import { Separator } from "components/components/ui/separator";

interface SkillCardProps {
  skill: Skill;
  showSeparator: boolean;
  onEdit: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
}

/** Displays a single skill with its name, description, and edit/delete action buttons. */
export function SkillCard({ skill, showSeparator, onEdit, onDelete }: SkillCardProps) {
  return (
    <div>
      {showSeparator && <Separator className="my-4" />}
      <div className="flex items-center justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-base">{skill.name}</p>
          <p className="text-sm text-muted-foreground truncate">{skill.description}</p>
        </div>
        <div className="flex items-center gap-2 ml-4 shrink-0">
          <Button size="icon" variant="outline" onClick={() => onEdit(skill)}>
            <Pencil className="size-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => onDelete(skill)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
