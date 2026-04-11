import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "opendiff";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // e.g., https://cdn.opendiff.dev

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || "",
    secretAccessKey: R2_SECRET_ACCESS_KEY || "",
  },
});

export function isStorageConfigured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_URL);
}

/**
 * Upload a file to R2
 * @param key - The key/path for the file (e.g., "org_avatars/abc123.png")
 * @param body - The file content as Buffer
 * @param contentType - MIME type of the file
 * @returns The public URL of the uploaded file
 */
export async function uploadFile(key: string, body: Buffer, contentType: string): Promise<string> {
  if (!isStorageConfigured()) {
    throw new Error("R2 storage is not configured");
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return `${R2_PUBLIC_URL}/${key}`;
}

/**
 * Delete a file from R2
 * @param key - The key/path of the file to delete
 */
export async function deleteFile(key: string): Promise<void> {
  if (!isStorageConfigured()) {
    throw new Error("R2 storage is not configured");
  }

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );
}

/**
 * Extract the key from a full R2 URL
 * @param url - The full public URL (may include query params like ?v=123)
 * @returns The key portion of the URL
 */
export function getKeyFromUrl(url: string): string | null {
  if (!R2_PUBLIC_URL || !url.startsWith(R2_PUBLIC_URL)) {
    return null;
  }
  const pathWithQuery = url.slice(R2_PUBLIC_URL.length + 1);
  // Strip query parameters
  const path = pathWithQuery.split("?")[0];
  return path;
}
