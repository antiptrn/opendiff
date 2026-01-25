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

// Safe error types that are allowed to be logged
type SafeErrorType = 'IMAGE_COMPRESSION_FAILED' | 'ORGANIZATION_CREATION_FAILED' | 'AVATAR_UPLOAD_FAILED';

// Safe logging function that prevents sensitive information leakage
const logError = async (errorType: SafeErrorType, error: unknown, context?: Record<string, any>): Promise<void> => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Predefined safe error messages to prevent sensitive data leakage
  const safeErrorMessages: Record<SafeErrorType, string> = {
    IMAGE_COMPRESSION_FAILED: 'Image compression operation failed',
    ORGANIZATION_CREATION_FAILED: 'Organization creation operation failed',
    AVATAR_UPLOAD_FAILED: 'Avatar upload operation failed'
  };
  
  const safeMessage = safeErrorMessages[errorType];
  
  if (isDevelopment) {
    // In development, log more details for debugging
    console.error(`[${errorType}] ${safeMessage}`, {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      context
    });
  } else {
    // In production, only log sanitized information
    const sanitizedContext = {
      timestamp: new Date().toISOString(),
      errorType,
      // Only include non-sensitive context information
      hasFile: context?.fileName ? true : false
    };
    
    console.error(safeMessage, sanitizedContext);
    
    // Here you would typically send to a proper logging service
    // Example: await loggerService.error(safeMessage, sanitizedContext);
  }
};

export default function CreateOrganizationPage() {
  const navigate = useNavigate();
  const { user, isLoading: isAuthLoading, logout } = useAuth();
  const { createOrg, isCreating, hasOrganizations, isLoadingOrgs, isUnauthorized } =
    useOrganization();
  const api = useApi();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentAvatarUrlRef = useRef<string | null>(null);

  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showContinueButton, setShowContinueButton] = useState(false);

  // Cleanup function to revoke the current URL if it exists
  const cleanupCurrentUrl = () => {
    if (currentAvatarUrlRef.current) {
      URL.revokeObjectURL(currentAvatarUrlRef.current);
      currentAvatarUrlRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupCurrentUrl();
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

      // Clean up the previous URL before creating a new one
      cleanupCurrentUrl();

      const newPreviewUrl = URL.createObjectURL(compressedFile);
      currentAvatarUrlRef.current = newPreviewUrl;
      setAvatarFile(compressedFile);
      setAvatarPreview(newPreviewUrl);
    } catch (error) {
      logError('IMAGE_COMPRESSION_FAILED', error, {
        fileName: file.name,
        fileType: file.type
      }).catch(() => {});
      setError("Failed to process image");
    }
  };

  const removeAvatar = () => {
    // Clean up the current URL
    cleanupCurrentUrl();
    
    setAvatarFile(null);
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleContinue = () => {
    navigate("/console");
  };

  const handleDismissError = () => {
    setError("");
    setShowContinueButton(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setShowContinueButton(false);

    if (name.trim().length < 2) {
      setError("Organization name must be at least 2 characters");
      return;
    }

    try {
      // Create the organization first
      const newOrg = await createOrg({ name: name.trim() });

      // Upload avatar if selected - handle this separately
      if (avatarFile) {
        setIsUploadingAvatar(true);
        try {
          const formData = new FormData();
          formData.append("file", avatarFile);
          await api.upload(`/api/organizations/${newOrg.id}/avatar`, formData);
        } catch (avatarError) {
          // Log the avatar upload error
          logError('AVATAR_UPLOAD_FAILED', avatarError, {
            organizationId: newOrg.id
          }).catch(() => {});
          
          // Show user feedback about partial failure with continue button
          setError("Organization created successfully, but logo upload failed. You can upload it later from organization settings.");
          setShowContinueButton(true);
          return;
        } finally {
          setIsUploadingAvatar(false);
        }
      }

      // Navigate to console - the query will be invalidated and refetched
      navigate("/console");
    } catch (err) {
      logError('ORGANIZATION_CREATION_FAILED', err).catch(() => {});
      setError(err instanceof Error ? err.message : "Failed to create organization");
    }
  };

  const isSubmitting = isCreating || isUploadingAvatar;

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
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive space-y-3">
                <div>{error}</div>
                {showContinueButton && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={handleContinue}
                      size="sm"
                      className="flex-1"
                    >
                      Continue to Console
                    </Button>
                    <Button
                      type="button"
                      onClick={handleDismissError}
                      variant="outline"
                      size="sm"
                    >
                      Dismiss
                    </Button>
                  </div>
                )}
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
                      aria-label="Remove logo"
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
                    disabled={isSubmitting}
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
                disabled={isSubmitting}
                autoFocus
              />
              <p className="text-sm text-muted-foreground">You can always change this later.</p>
            </div>
          </CardContent>
          
          <CardFooter>
            <Button type="submit" disabled={isSubmitting || !name.trim()} className="w-full">
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isCreating ? "Creating..." : isUploadingAvatar ? "Uploading logo..." : "Create organization"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </section>
  );
}