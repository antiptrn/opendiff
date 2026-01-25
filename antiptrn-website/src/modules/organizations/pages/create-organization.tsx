import { useState, useRef, useEffect } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@features/auth";
import { useOrganization } from "@modules/organizations";
import { useApi } from "@services";
import { Avatar, AvatarFallback, AvatarImage } from "@shared/components/ui/avatar";
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { Label } from "@shared/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@shared/components/ui/card";
import { Loader2, ArrowLeft, Upload, X } from "lucide-react";
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

  // Cleanup avatarPreview URL on unmount
  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

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

      // Revoke the previous URL before creating a new one
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }

      const newPreviewUrl = URL.createObjectURL(compressedFile);
      setAvatarFile(compressedFile);
      setAvatarPreview(newPreviewUrl);
    } catch (error) {
      console.error('Image compression failed for file:', file.name, file.type, error);
      setError("Failed to process image");
    }
  };

  const removeAvatar = () => {
    // Revoke the URL before clearing the state
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }
    
    setAvatarFile(null);
    setAvatarPreview(null);
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
          <div className="px-4 pt-6">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/console">
                <ArrowLeft className="size-4" />
                Back to console
              </Link>
            </Button>
          </div>
        )}
        <CardHeader>
          <CardTitle>
            {hasOrganizations ? "Create another organization" : "Create your organization"}
          </CardTitle>
          <CardDescription>
            Organizations help you manage your team and billing in one place.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Avatar upload */}
            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="size-16 rounded-xl overflow-hidden">
                    <AvatarImage src={avatarPreview || undefined} alt="Organization logo" />
                    <AvatarFallback className="text-2xl rounded-xl">
                      {name.trim() ? name.charAt(0).toUpperCase() : "?"}
                    </AvatarFallback>
                  </Avatar>
                  {avatarPreview && (
                    <Button
                      type="button"
                      onClick={removeAvatar}
                      size="sm"
                      variant="destructive"
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 p-0 rounded-full transition-colors hover:bg-destructive/90"
                    >
                      <X className="size-3" />
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCreating}
                  >
                    <Upload className="size-4" />
                    {avatarPreview ? "Change" : "Upload"}
                  </Button>
                  <p className="text-xs text-muted-foreground">Square, at least 128px</p>
                </div>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Acme Inc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isCreating}
                autoFocus
              />
              <p className="text-sm text-muted-foreground">You can always change this later.</p>
            </div>
          </CardContent>
          
          <CardFooter>
            <Button type="submit" disabled={isCreating || !name.trim()} className="w-full">
              {isCreating && <Loader2 className="size-4 animate-spin" />}
              {isCreating ? "Creating..." : "Create organization"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </section>
  );
}