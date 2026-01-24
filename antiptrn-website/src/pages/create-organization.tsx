import { useState, useRef } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/hooks/use-organization";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Building2, ArrowLeft, Upload, X } from "lucide-react";
import imageCompression from "browser-image-compression";

export default function CreateOrganizationPage() {
  const navigate = useNavigate();
  const { user, isLoading: isAuthLoading, logout } = useAuth();
  const { createOrg, isCreating, hasOrganizations, isLoadingOrgs, isUnauthorized } =
    useOrganization();
  const api = useApi();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Show loading while checking auth
  if (isAuthLoading) {
    return (
      <section className="w-screen h-screen flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </section>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If token is expired/invalid, log out and redirect to login
  if (isUnauthorized) {
    logout();
    return <Navigate to="/login" replace />;
  }

  // Redirect to onboarding if not completed - check from user object (database)
  if (!user.onboardingCompletedAt) {
    return <Navigate to="/onboarding" replace />;
  }

  // Now wait for orgs to load
  if (isLoadingOrgs) {
    return (
      <section className="w-screen h-screen flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </section>
    );
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      setError("Invalid file type. Allowed: JPEG, PNG, WebP, GIF");
      return;
    }

    setError("");

    try {
      // Compress the image
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 256,
        useWebWorker: true,
      });

      setAvatarFile(compressedFile);
      setAvatarPreview(URL.createObjectURL(compressedFile));
    } catch {
      setError("Failed to process image");
    }
  };

  const removeAvatar = () => {
    setAvatarFile(null);
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Organization name must be at least 2 characters");
      return;
    }

    try {
      const newOrg = await createOrg({ name: name.trim() });

      // Upload avatar if selected
      if (avatarFile) {
        const formData = new FormData();
        formData.append("file", avatarFile);
        await api.upload(`/api/organizations/${newOrg.id}/avatar`, formData);
      }

      // Navigate to console - the query will be invalidated and refetched
      navigate("/console");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
    }
  };

  return (
    <section className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {hasOrganizations && (
          <div className="p-4 pb-0">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/console">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to console
              </Link>
            </Button>
          </div>
        )}
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {hasOrganizations ? "Create another organization" : "Create your organization"}
          </CardTitle>
          <CardDescription>
            Organizations help you manage your team and billing in one place.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Avatar upload */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                {avatarPreview ? (
                  <div className="relative">
                    <img
                      src={avatarPreview}
                      alt="Avatar preview"
                      className="size-20 rounded-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={removeAvatar}
                      className="absolute -top-1 -right-1 size-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="size-20 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                  >
                    <Building2 className="size-8 text-muted-foreground" />
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarChange}
                className="hidden"
              />
              {!avatarPreview && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCreating}
                >
                  <Upload className="size-4" />
                  Upload logo
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Organization name</Label>
              <Input
                id="name"
                size="sm"
                placeholder="Acme Inc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isCreating}
                autoFocus
              />
              <p className="text-sm text-muted-foreground">You can always change this later.</p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>

          <CardFooter>
            <Button type="submit" className="w-full" disabled={isCreating || !name.trim()}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create organization"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </section>
  );
}
