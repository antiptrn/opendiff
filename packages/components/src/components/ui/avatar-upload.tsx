import imageCompression from "browser-image-compression";
import { Loader2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

interface AvatarUploadProps {
  /** Current avatar URL (for existing entities) */
  src?: string | null;
  /** Fallback text (usually first letter of name) */
  fallback: string;
  /** Alt text for the image */
  alt?: string;
  /** Size of the avatar */
  size?: "sm" | "md" | "lg";
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Called when upload completes (immediate mode) or file is selected (deferred mode) */
  onUpload?: (file: File) => Promise<void> | void;
  /** Called when avatar is removed (deferred mode only) */
  onRemove?: () => void;
  /** Show remove button (for deferred mode with preview) */
  showRemove?: boolean;
  /** Helper text below the avatar */
  helperText?: string;
  /** Class name for the container */
  className?: string;
}

const sizeClasses = {
  sm: "size-12",
  md: "size-16",
  lg: "size-20",
};

const fallbackTextSizes = {
  sm: "text-lg",
  md: "text-3xl",
  lg: "text-2xl",
};

export function AvatarUpload({
  src,
  fallback,
  alt,
  size = "md",
  disabled = false,
  onUpload,
  onRemove,
  showRemove = false,
  helperText,
  className,
}: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const prevPreviewRef = useRef<string | null>(null);

  // Revoke previous URL when a new one is created
  useEffect(() => {
    if (prevPreviewRef.current && prevPreviewRef.current !== previewUrl) {
      URL.revokeObjectURL(prevPreviewRef.current);
    }
    prevPreviewRef.current = previewUrl;
  }, [previewUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (prevPreviewRef.current) {
        URL.revokeObjectURL(prevPreviewRef.current);
      }
    };
  }, []);

  // Reset preview when src changes (e.g., after successful upload)
  useEffect(() => {
    if (src) {
      setPreviewUrl(null);
    }
  }, [src]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return;
    }

    setIsUploading(true);

    try {
      // Compress the image
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 256,
        useWebWorker: true,
      });

      // Show preview immediately
      setPreviewUrl(URL.createObjectURL(compressedFile));

      // Call the upload handler
      if (onUpload) {
        await onUpload(compressedFile);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onRemove?.();
  };

  const displayUrl = previewUrl || src;

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <div className="relative group">
        <Avatar className={cn(sizeClasses[size])}>
          <AvatarImage src={displayUrl ?? undefined} alt={alt} />
          <AvatarFallback className={cn(fallbackTextSizes[size])}>{fallback}</AvatarFallback>
        </Avatar>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          aria-label="Upload avatar"
          className="cursor-pointer absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity disabled:cursor-not-allowed"
        >
          {isUploading ? (
            <Loader2 className="size-4 text-white animate-spin" />
          ) : (
            <Upload className="size-4 text-white" />
          )}
        </button>

        {showRemove && displayUrl && !isUploading && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            aria-label="Remove avatar"
            className="absolute -top-1 -right-1 size-5 rounded-full bg-muted-foreground text-background flex items-center justify-center hover:bg-foreground transition-colors disabled:cursor-not-allowed"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {helperText && <p className="text-sm text-muted-foreground">{helperText}</p>}
    </div>
  );
}
