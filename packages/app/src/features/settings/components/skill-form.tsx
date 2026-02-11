import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "components/components/ui/dialog";
import { Input } from "components/components/ui/input";
import { Label } from "components/components/ui/label";
import { LoadingButton } from "components/components/ui/loading-button";
import { Textarea } from "components/components/ui/textarea";

export interface SkillFormState {
  name: string;
  description: string;
  content: string;
}

export const EMPTY_FORM: SkillFormState = { name: "", description: "", content: "" };

interface SkillFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  form: SkillFormState;
  onFormChange: (form: SkillFormState) => void;
  onSave: () => void;
  isSaving: boolean;
}

/** Dialog form for creating or editing a skill with name, description, and content fields. */
export function SkillForm({
  open,
  onOpenChange,
  isEditing,
  form,
  onFormChange,
  onSave,
  isSaving,
}: SkillFormProps) {
  const isFormValid = form.name.trim() && form.description.trim() && form.content.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Skill" : "New Skill"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the skill's name, description, or content."
              : "Create a new skill with instructions for the review agent."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="skill-name">Name</Label>
            <Input
              id="skill-name"
              placeholder="e.g. security-review"
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              className="bg-background"
            />
            <p className="text-xs text-muted-foreground">
              Letters, numbers, hyphens, and underscores only.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="skill-description">Description</Label>
            <Input
              id="skill-description"
              placeholder="e.g. Review code for common security vulnerabilities"
              value={form.description}
              onChange={(e) => onFormChange({ ...form, description: e.target.value })}
              className="bg-background"
            />
            <p className="text-xs text-muted-foreground">
              Short description used for skill routing.
            </p>
          </div>

          <div className="space-y-2 w-full">
            <Label htmlFor="skill-content">Content</Label>
            <Textarea
              id="skill-content"
              placeholder="Write the instructions the agent should follow..."
              value={form.content}
              onChange={(e) => onFormChange({ ...form, content: e.target.value })}
              className="min-h-[140px] max-h-[240px] w-full bg-background"
            />
          </div>

          <LoadingButton
            onClick={onSave}
            disabled={!isFormValid}
            isLoading={isSaving}
            loadingText={isEditing ? "Saving..." : "Creating..."}
          >
            {isEditing ? "Save Changes" : "Create Skill"}
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
