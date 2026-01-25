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
  const prevPreviewRef = useRef<string | null>(null);

  // Revoke the previous URL when a new one is created
  useEffect(() => {
    if (prevPreviewRef.current && prevPreviewRef.current !== avatarPreview) {
      URL.revokeObjectURL(prevPreviewRef.current);
    }
    prevPreviewRef.current = avatarPreview;
  }, [avatarPreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (prevPreviewRef.current) {
        URL.revokeObjectURL(prevPreviewRef.current);
      }
    };
  }, []);

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
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center relative">
          {hasOrganizations && (
            <Button variant="ghost" size="sm" className="absolute left-4 top-4" asChild>
              <Link to="/console" aria-label="Back to console">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
          )}
          <CardTitle className="text-xl">
            {hasOrganizations ? "New organization" : "Create your organization"}
          </CardTitle>
          <CardDescription>
            Manage your team and billing in one place.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Avatar upload */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative group">
                <Avatar className="size-20 rounded-xl">
                  <AvatarImage src={avatarPreview ?? undefined} alt="Organization logo" />
                  <AvatarFallback className="text-2xl rounded-xl bg-muted">
                    {name.trim() ? name.charAt(0).toUpperCase() : "?"}
                  </AvatarFallback>
                </Avatar>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCreating}
                  aria-label="Upload organization logo"
                  className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                >
                  <Upload className="size-5 text-white" />
                </button>
                {avatarPreview && (
                  <button
                    type="button"
                    onClick={removeAvatar}
                    aria-label="Remove logo"
                    className="absolute -top-1 -right-1 size-5 rounded-full bg-muted-foreground text-background flex items-center justify-center hover:bg-foreground transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Click to upload logo</p>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Organization name</Label>
              <Input
                id="name"
                placeholder="Acme Inc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isCreating}
                autoFocus
              />
            </div>

            <Button type="submit" className="w-full" disabled={isCreating || !name.trim()}>
              {isCreating && <Loader2 className="size-4 animate-spin" />}
              {isCreating ? "Creating..." : "Create organization"}
            </Button>
          </CardContent>
        </form>
      </Card>
    </section>
  );
}
