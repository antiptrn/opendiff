import {
  type Skill,
  useCreateSkill,
  useDeleteSkill,
  useSkills,
  useUpdateSkill,
} from "@/features/settings";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { SearchBar } from "components/components/ui/search-bar";
import { useEffect, useRef, useState } from "react";
import type { useAuth } from "shared/auth";
import { toast } from "sonner";
import { EMPTY_FORM, SkillForm, type SkillFormState } from "./skill-form";
import { SkillsList } from "./skills-list";

interface SkillsTabProps {
  user: ReturnType<typeof useAuth>["user"];
}

function parseSkillFile(
  filename: string,
  raw: string
): { name: string; description: string; content: string } {
  const baseName = filename
    .replace(/\.(md|txt)$/i, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "");

  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (match) {
    const frontmatter = match[1];
    const body = match[2].trim();

    let name = baseName;
    let description = "";

    for (const line of frontmatter.split("\n")) {
      const nameMatch = line.match(/^name:\s*(.+)/);
      if (nameMatch) name = nameMatch[1].trim();

      const descMatch = line.match(/^description:\s*(.+)/);
      if (descMatch) description = descMatch[1].trim();
    }

    return { name, description, content: body };
  }

  return { name: baseName, description: "", content: raw.trim() };
}

/** Skills management tab for creating, editing, deleting, and uploading review agent skills. */
export function SkillsTab({ user }: SkillsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useSkills(
    user?.access_token,
    debouncedSearch
  );

  const createSkill = useCreateSkill(user?.access_token);
  const updateSkill = useUpdateSkill(user?.access_token);
  const deleteSkill = useDeleteSkill(user?.access_token);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [form, setForm] = useState<SkillFormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const skills = data?.pages.flatMap((page) => page.skills) ?? [];

  const openCreate = () => {
    setEditingSkill(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (skill: Skill) => {
    setEditingSkill(skill);
    setForm({ name: skill.name, description: skill.description, content: skill.content });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingSkill) {
        await updateSkill.mutateAsync({
          id: editingSkill.id,
          name: form.name,
          description: form.description,
          content: form.content,
        });
        toast.success("Skill updated");
      } else {
        await createSkill.mutateAsync(form);
        toast.success("Skill created");
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save skill");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSkill.mutateAsync(deleteTarget.id);
      toast.success("Skill deleted");
      setIsDeleteDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete skill");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    let created = 0;
    let failed = 0;

    for (const file of Array.from(files)) {
      try {
        const raw = await file.text();
        const parsed = parseSkillFile(file.name, raw);

        if (!parsed.name || !parsed.content) {
          failed++;
          continue;
        }

        await createSkill.mutateAsync({
          name: parsed.name,
          description: parsed.description || parsed.name,
          content: parsed.content,
        });
        created++;
      } catch {
        failed++;
      }
    }

    setIsUploading(false);

    if (created > 0) {
      toast.success(`${created} skill${created > 1 ? "s" : ""} uploaded`);
    }
    if (failed > 0) {
      toast.error(`${failed} file${failed > 1 ? "s" : ""} failed to upload`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const isSaving = createSkill.isPending || updateSkill.isPending;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
          <CardDescription>
            Skills are intelligently applied instructions that the review agent follows when
            reviewing your code.
          </CardDescription>
          <SearchBar
            containerClassName="mt-3"
            className="bg-background"
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-y-auto mt-2">
            <SkillsList
              skills={skills}
              isLoading={isLoading}
              searchQuery={debouncedSearch}
              hasNextPage={hasNextPage ?? false}
              isFetchingNextPage={isFetchingNextPage}
              onFetchNextPage={fetchNextPage}
              onEdit={openEdit}
              onDelete={(skill) => {
                setDeleteTarget(skill);
                setIsDeleteDialogOpen(true);
              }}
            />
          </div>

          <div className="flex items-center gap-2 mt-8">
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              Upload
            </Button>
            <Button onClick={openCreate}>New Skill</Button>
          </div>
        </CardContent>
      </Card>

      <SkillForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isEditing={!!editingSkill}
        form={form}
        onFormChange={setForm}
        onSave={handleSave}
        isSaving={isSaving}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Skill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              variant="outline"
              onClick={handleDelete}
              disabled={deleteSkill.isPending}
            >
              Delete
            </AlertDialogAction>
            <AlertDialogCancel variant="default">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
