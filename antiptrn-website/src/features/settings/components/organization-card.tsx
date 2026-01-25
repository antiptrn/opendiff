import { useState, useEffect, useRef } from "react";
import imageCompression from "browser-image-compression";
import { Button } from "@shared/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@shared/components/ui/card";
import { Checkbox } from "@shared/components/ui/checkbox";
import { Input } from "@shared/components/ui/input";
import { Label } from "@shared/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/components/ui/avatar";
import { Loader2, Upload } from "lucide-react";
import { useApi } from "@services";

interface OrganizationCardProps {
  orgId: string | null;
  avatarUrl: string | null;
  orgName: string;
  isOwner: boolean;
  isRegisteredBusiness: boolean;
  businessName: string | null;
  taxVatId: string | null;
  onUpdated: () => void;
}

/**
 * Card component for managing organization profile (avatar, name)
 */
export function OrganizationCard({
  orgId,
  avatarUrl,
  orgName,
  isOwner,
  isRegisteredBusiness,
  businessName,
  taxVatId,
  onUpdated,
}: OrganizationCardProps) {
  const api = useApi();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState(orgName);
  const [isBusinessChecked, setIsBusinessChecked] = useState(isRegisteredBusiness);
  const [businessNameInput, setBusinessNameInput] = useState(businessName ?? "");
  const [taxVatIdInput, setTaxVatIdInput] = useState(taxVatId ?? "");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Reset inputs when props change
  useEffect(() => {
    setNameInput(orgName);
  }, [orgName]);

  useEffect(() => {
    setIsBusinessChecked(isRegisteredBusiness);
    setBusinessNameInput(businessName ?? "");
    setTaxVatIdInput(taxVatId ?? "");
  }, [isRegisteredBusiness, businessName, taxVatId]);

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

  const handleSave = async () => {
    if (!orgId) return;

    if (nameInput.trim().length < 2) {
      setError("Organization name must be at least 2 characters");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payload: Record<string, unknown> = {};

      if (nameInput.trim() !== orgName) {
        payload.name = nameInput.trim();
      }

      // Only owners can update business info
      if (isOwner) {
        if (isBusinessChecked !== isRegisteredBusiness) {
          payload.isRegisteredBusiness = isBusinessChecked;
        }
        if (isBusinessChecked) {
          if (businessNameInput.trim() !== (businessName ?? "")) {
            payload.businessName = businessNameInput.trim();
          }
          if (taxVatIdInput.trim() !== (taxVatId ?? "")) {
            payload.taxVatId = taxVatIdInput.trim();
          }
        }
      }

      if (Object.keys(payload).length === 0) {
        return;
      }

      const response = await api.put(`/api/organizations/${orgId}`, payload);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update organization");
      }

      setSuccessMessage("Settings saved");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update organization");
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    nameInput.trim() !== orgName ||
    (isOwner && (
      isBusinessChecked !== isRegisteredBusiness ||
      (isBusinessChecked && (
        businessNameInput.trim() !== (businessName ?? "") ||
        taxVatIdInput.trim() !== (taxVatId ?? "")
      ))
    ));

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
                    className="px-0 size-7 rounded-sm bg-black/50 hover:bg-black/30"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isSaving}
                  >
                    {isUploading ? (
                      <Loader2 className="size-3 text-white animate-spin" />
                    ) : (
                      <Upload className="size-3 text-white" />
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
          <Input
            id="org-name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            disabled={isUploading || isSaving}
            placeholder="Organization name"
          />
        </div>

        {/* Business Info - Owner only */}
        {isOwner && (
          <>
            <div className="flex items-center space-x-2.5 group cursor-pointer">
              <Checkbox
                id="is-business"
                className="transition-colors group-hover:border-foreground/10 cursor-pointer"
                checked={isBusinessChecked}
                onCheckedChange={(checked) => setIsBusinessChecked(checked === true)}
                disabled={isUploading || isSaving}
              />
              <Label htmlFor="is-business" className="cursor-pointer transition-colors text-foreground/80 group-hover:text-foreground">
                This organization is a registered business
              </Label>
            </div>

            {isBusinessChecked && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="business-name">Business Name</Label>
                  <Input
                    id="business-name"
                    value={businessNameInput}
                    onChange={(e) => setBusinessNameInput(e.target.value)}
                    disabled={isUploading || isSaving}
                    placeholder="Legal business name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tax-vat-id">TAX / VAT ID</Label>
                  <Input
                    id="tax-vat-id"
                    value={taxVatIdInput}
                    onChange={(e) => setTaxVatIdInput(e.target.value)}
                    disabled={isUploading || isSaving}
                    placeholder="e.g. US12-3456789 or GB123456789"
                  />
                </div>
              </div>
            )}
          </>
        )}

        <Button
          className="w-fit"
          onClick={handleSave}
          disabled={!hasChanges || isSaving || isUploading}
        >
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
