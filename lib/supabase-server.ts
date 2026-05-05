import { createClient } from "@supabase/supabase-js";
import type { GenerationLogger } from "./generation-logger";

const GENERATED_IMAGES_BUCKET = "generated-images";

export function getSupabaseServerClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function uploadGeneratedDataImage(dataUrl: string, path: string) {
  const uploaded = await uploadDataImageToStorage(dataUrl, GENERATED_IMAGES_BUCKET, path);
  return uploaded.publicUrl;
}

export async function uploadDataImageToStorage(dataUrl: string, bucket: string, path: string, logger?: GenerationLogger) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    logger?.info("storage upload skipped", { reason: "image_already_url", bucket });
    return { publicUrl: dataUrl, storageKey: null };
  }

  const [, contentType, base64] = match;
  const supabase = getSupabaseServerClient();
  logger?.info("storage bucket inspection started", { bucket });
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Could not inspect Supabase Storage buckets: ${listError.message}`);
  }
  logger?.info("storage bucket inspection completed", { bucket, bucketExists: buckets.some((item) => item.name === bucket) });

  if (!buckets.some((item) => item.name === bucket)) {
    logger?.info("storage bucket creation started", { bucket });
    const { error: createError } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
    });

    if (createError && !createError.message.toLowerCase().includes("already exists")) {
      throw new Error(`Could not create generated images bucket: ${createError.message}`);
    }
    logger?.info("storage bucket creation completed", { bucket });
  }

  const extension = contentType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const objectPath = `${path}.${extension}`;
  logger?.info("storage object upload started", {
    bucket,
    storageKey: objectPath,
    contentType,
    bytes: Buffer.byteLength(base64, "base64"),
  });
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, Buffer.from(base64, "base64"), {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Could not upload generated image: ${uploadError.message}`);
  }
  logger?.info("storage object upload completed", { bucket, storageKey: objectPath });

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  logger?.info("storage public url resolved", { bucket, storageKey: objectPath });
  return { publicUrl: data.publicUrl, storageKey: objectPath };
}
