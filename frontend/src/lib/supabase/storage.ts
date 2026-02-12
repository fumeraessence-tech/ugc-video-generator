import { createClient } from "./client";

/**
 * Upload a file to Supabase Storage.
 * Files are stored under `{bucket}/{userId}/{path}`.
 */
export async function uploadFile(
  bucket: string,
  userId: string,
  path: string,
  file: File | Blob | Buffer,
  options?: { contentType?: string; upsert?: boolean }
) {
  const supabase = createClient();
  const fullPath = `${userId}/${path}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(fullPath, file, {
      contentType: options?.contentType,
      upsert: options?.upsert ?? false,
    });

  if (error) throw error;
  return data;
}

/**
 * Get the public URL for a file.
 */
export function getPublicUrl(bucket: string, path: string): string {
  const supabase = createClient();
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFile(bucket: string, path: string) {
  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

/**
 * List files in a folder.
 */
export async function listFiles(bucket: string, folder: string) {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(bucket).list(folder);
  if (error) throw error;
  return data;
}
