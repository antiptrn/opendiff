import { Loader2 } from "lucide-react";
import { AvatarUpload } from "components/components/ui/avatar-upload";
import { Button } from "components/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "components/components/ui/card";
import { Checkbox } from "components/components/ui/checkbox";
import { Input } from "components/components/ui/input";
import { Label } from "components/components/ui/label";
import { useApi } from "shared/services";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
  const [isSaving, setIsSaving] = useState(false);
  const [nameInput, setNameInput] = useState(orgName);
  const [isBusinessChecked, setIsBusinessChecked] = useState(isRegisteredBusiness);
  const [businessNameInput, setBusinessNameInput] = useState(businessName ?? "");
  const [taxVatIdInput, setTaxVatIdInput] = useState(taxVatId ?? "");

  // Reset inputs when props change
  useEffect(() => {
    setNameInput(orgName);
  }, [orgName]);

  useEffect(() => {
    setIsBusinessChecked(isRegisteredBusiness);
    setBusinessNameInput(businessName ?? "");
    setTaxVatIdInput(taxVatId ?? "");
  }, [isRegisteredBusiness, businessName, taxVatId]);

  const handleAvatarUpload = async (file: File) => {
    if (!orgId) return;

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.upload(`/api/organizations/${orgId}/avatar`, formData);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to upload avatar");
      }

      toast.success("Avatar updated");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload avatar");
    }
  };

  const handleSave = async () => {
    if (!orgId) return;

    if (nameInput.trim().length < 2) {
      toast.error("Organization name must be at least 2 characters");
      return;
    }

    setIsSaving(true);

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

      toast.success("Settings saved");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update organization");
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    nameInput.trim() !== orgName ||
    (isOwner &&
      (isBusinessChecked !== isRegisteredBusiness ||
        (isBusinessChecked &&
          (businessNameInput.trim() !== (businessName ?? "") ||
            taxVatIdInput.trim() !== (taxVatId ?? "")))));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Profile</CardTitle>
        <CardDescription>Manage your teams's profile</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Avatar */}
        <AvatarUpload
          src={avatarUrl}
          fallback={orgName.charAt(0)}
          alt={orgName}
          size="md"
          disabled={isSaving}
          onUpload={handleAvatarUpload}
          helperText="Recommended: Square image, at least 128x128 pixels."
        />

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="org-name">Name</Label>
          <Input
            id="org-name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            disabled={isSaving}
            className="bg-background"
            placeholder="Organization name"
          />
        </div>

        {/* Business Info - Owner only */}
        {isOwner && (
          <>
            <div className="flex items-center space-x-3 group cursor-pointer">
              <Checkbox
                id="is-business"
                className="cursor-pointer"
                checked={isBusinessChecked}
                onCheckedChange={(checked) => setIsBusinessChecked(checked === true)}
                disabled={isSaving}
              />
              <Label htmlFor="is-business" className="cursor-pointer text-base">
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
                    disabled={isSaving}
                    placeholder="Legal business name"
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tax-vat-id">TAX / VAT ID</Label>
                  <Input
                    id="tax-vat-id"
                    value={taxVatIdInput}
                    onChange={(e) => setTaxVatIdInput(e.target.value)}
                    disabled={isSaving}
                    placeholder="e.g. US12-3456789 or GB123456789"
                    className="bg-background"
                  />
                </div>
              </div>
            )}
          </>
        )}

        <Button className="w-fit" onClick={handleSave} disabled={!hasChanges || isSaving}>
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
