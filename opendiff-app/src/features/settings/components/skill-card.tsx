import type { Skill } from "@/features/settings";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "opendiff-components/components/ui/button";
import { Separator } from "opendiff-components/components/ui/separator";

interface SkillCardProps {
  skill: Skill;
  showSeparator: boolean;
  onEdit: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
}

export function SkillCard({ skill, showSeparator, onEdit, onDelete }: SkillCardProps) {
  return (
    <div>
      {showSeparator && <Separator className="my-4" />}
      <div className="flex items-center justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-base font-medium">{skill.name}</p>
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
