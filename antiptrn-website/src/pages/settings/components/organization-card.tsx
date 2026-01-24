import { useState, useEffect, useRef } from "react";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Upload } from "lucide-react";
import { useApi } from "@/hooks/use-api";

interface OrganizationCardProps {
  orgId: string | null;
  avatarUrl: string | null;
  orgName: string;
  onUpdated: () => void;
}

/**
 * Card component for managing organization profile (avatar, name)
 */
export function OrganizationCard({ orgId, avatarUrl, orgName, onUpdated }: OrganizationCardProps) {
  const api = useApi();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState(orgName);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Reset name input when orgName changes
  useEffect(() => {
    setNameInput(orgName);
  }, [orgName]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !orgId) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      setError("Invalid file type. Allowed: JPEG, PNG, WebP, GIF");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Compress the image
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 256,
        useWebWorker: true,
      });

      const formData = new FormData();
      formData.append("file", compressedFile);
      const response = await api.upload(`/api/organizations/${orgId}/avatar`, formData);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to upload avatar");
      }

      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload avatar");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSaveName = async () => {
    if (!orgId || !nameInput.trim() || nameInput.trim() === orgName) return;

    if (nameInput.trim().length < 2) {
      setError("Organization name must be at least 2 characters");
      return;
    }

    setIsSavingName(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await api.put(`/api/organizations/${orgId}`, { name: nameInput.trim() });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update organization name");
      }

      setSuccessMessage("Organization name updated");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update organization name");
    } finally {
      setIsSavingName(false);
    }
  };

  const hasNameChanges = nameInput.trim() !== orgName;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Profile</CardTitle>
        <CardDescription>Manage your teams's profile</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600 dark:bg-green-400/10 dark:text-green-400">
            {successMessage}
          </div>
        )}

        {/* Avatar */}
        <div className="space-y-2">
          <div className="flex flex-col items-start gap-4">
            <div className="relative">
              <Avatar className="size-16 rounded-xl overflow-hidden">
                <AvatarImage src={avatarUrl ?? undefined} alt={orgName} />
                <div className="absolute z-10 inset-0 flex items-center justify-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="px-0 size-8 bg-background/50 hover:bg-background/30"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || false || isSavingName}
                  >
                    {isUploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                  </Button>
                </div>
                <AvatarFallback className="text-3xl">{orgName.charAt(0)}</AvatarFallback>
              </Avatar>
              <p className="mt-2 text-sm text-muted-foreground">
                Recommended: Square image, at least 128x128 pixels.
              </p>
            </div>
          </div>
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="org-name">Name</Label>
          <div className="flex flex-col gap-4">
            <Input
              id="org-name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              disabled={isUploading || false || isSavingName}
              placeholder="Organization name"
            />
            <Button
              className="w-fit mt-2"
              onClick={handleSaveName}
              disabled={!hasNameChanges || isSavingName || isUploading || false}
            >
              {isSavingName ? <Loader2 className="size-4 animate-spin" /> : "Save Settings"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
