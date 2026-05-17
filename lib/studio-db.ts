import type { Brand, ContentRun, GeneratedImage, StudioData, User } from "./types";
import { getSupabaseServerClient, uploadDataImageToStorage } from "./supabase-server";

const MOCKO_BUCKET = "mocko-studio";

export async function ensurePublicUser(user: User): Promise<User> {
  const supabase = getSupabaseServerClient();
  const { data: existingByEmail, error: existingError } = await supabase
    .from("users")
    .select("*")
    .eq("email", user.email)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Could not inspect user: ${existingError.message}`);
  }

  if (existingByEmail) {
    return toUser(existingByEmail);
  }

  const { error } = await supabase.from("users").upsert(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatarUrl,
      role: user.role || "user",
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(`Could not save user: ${error.message}`);
  }

  return user;
}

export async function loadStudioDataFromDb(user: User): Promise<StudioData> {
  await ensurePublicUser(user);
  const supabase = getSupabaseServerClient();

  const { data: brandRows, error: brandsError } = await supabase
    .from("brands")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (brandsError) throw new Error(`Could not load brands: ${brandsError.message}`);

  const { data: runRows, error: runsError } = await supabase
    .from("content_runs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (runsError) throw new Error(`Could not load content runs: ${runsError.message}`);

  const runIds = (runRows || []).map((run) => run.id);
  const { data: imageRows, error: imagesError } = runIds.length
    ? await supabase.from("generated_images").select("*").in("run_id", runIds)
    : { data: [], error: null };
  if (imagesError) throw new Error(`Could not load generated images: ${imagesError.message}`);

  return {
    user,
    activeRunId: runRows?.[0]?.id ?? null,
    brands: (brandRows || []).map(toBrand),
    runs: (runRows || []).map(toRun),
    images: (imageRows || []).map(toImage),
  };
}

export async function upsertBrand(userId: string, brand: Brand) {
  const supabase = getSupabaseServerClient();
  const id = brand.id || crypto.randomUUID();
  let logoUrl = brand.logoUrl;
  let styleImageUrl = brand.styleImageUrl;
  let logoStorageKey: string | null = null;
  let styleImageStorageKey: string | null = null;

  if (logoUrl?.startsWith("data:")) {
    const uploaded = await uploadDataImageToStorage(
      logoUrl,
      MOCKO_BUCKET,
      `logos/${id}-${Date.now()}`,
    );
    logoUrl = uploaded.publicUrl;
    logoStorageKey = uploaded.storageKey;
  }

  if (styleImageUrl?.startsWith("data:")) {
    const uploaded = await uploadDataImageToStorage(
      styleImageUrl,
      MOCKO_BUCKET,
      `style-refs/${id}-${Date.now()}`,
    );
    styleImageUrl = uploaded.publicUrl;
    styleImageStorageKey = uploaded.storageKey;
  }

  const { data, error } = await supabase
    .from("brands")
    .upsert(
      {
        id,
        user_id: userId,
        name: brand.name,
        logo_url: logoUrl,
        ...(logoStorageKey ? { logo_storage_key: logoStorageKey } : {}),
        style_image_url: styleImageUrl,
        ...(styleImageStorageKey ? { style_image_storage_key: styleImageStorageKey } : {}),
        master_prompt: brand.masterPrompt || "",
        cms_url: brand.cmsUrl || null,
        cms_email: brand.cmsEmail || null,
        cms_password: brand.cmsPassword || null,
        cms_collection_slug: brand.cmsCollectionSlug || "posts",
        linkedin_organization_id: brand.linkedinOrganizationId || null,
        linkedin_access_token: brand.linkedinAccessToken || null,
        linkedin_access_token_expires_at: brand.linkedinAccessTokenExpiresAt || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Could not save brand: ${error.message}`);
  }

  return toBrand(data);
}

export async function deleteBrandFromDb(userId: string, brandId: string) {
  const supabase = getSupabaseServerClient();
  const { data: runs, error: runsError } = await supabase
    .from("content_runs")
    .select("id")
    .eq("brand_id", brandId)
    .eq("user_id", userId);
  if (runsError) throw new Error(`Could not inspect brand runs: ${runsError.message}`);

  const runIds = (runs || []).map((run) => run.id);
  if (runIds.length) {
    const { error: imagesError } = await supabase.from("generated_images").delete().in("run_id", runIds);
    if (imagesError) throw new Error(`Could not delete brand images: ${imagesError.message}`);

    const { error: runError } = await supabase.from("content_runs").delete().in("id", runIds);
    if (runError) throw new Error(`Could not delete brand runs: ${runError.message}`);
  }

  const { error } = await supabase.from("brands").delete().eq("id", brandId).eq("user_id", userId);
  if (error) throw new Error(`Could not delete brand: ${error.message}`);
}

export async function updateBrandLinkedInOAuth(params: {
  userId: string;
  brandId: string;
  accessToken: string;
  expiresAt: string | null;
  personUrn: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("brands")
    .update({
      linkedin_access_token: params.accessToken,
      linkedin_access_token_expires_at: params.expiresAt,
      linkedin_person_urn: params.personUrn,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.brandId)
    .eq("user_id", params.userId)
    .select("*")
    .single();

  if (error) throw new Error(`Could not save LinkedIn connection: ${error.message}`);
  return toBrand(data);
}

export async function createRunInDb(params: {
  userId: string;
  brandId: string;
  topic: string;
  primaryKeyword: string;
  title: string;
  markdown: string;
  metaDescription: string;
  urlSlug: string;
  imageSummary: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("content_runs")
    .insert({
      id: crypto.randomUUID(),
      user_id: params.userId,
      brand_id: params.brandId,
      topic: params.topic,
      primary_keyword: params.primaryKeyword,
      article_title: params.title,
      article_markdown: params.markdown,
      meta_description: params.metaDescription,
      url_slug: params.urlSlug,
      seo_title: params.title,
      image_summary: params.imageSummary,
      stage: "article_done",
      approved: false,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Could not create content run: ${error.message}`);
  return toRun(data);
}

export async function cloneRunInDb(params: { userId: string; run: ContentRun }) {
  const supabase = getSupabaseServerClient();
  const { run } = params;
  const { data, error } = await supabase
    .from("content_runs")
    .insert({
      id: crypto.randomUUID(),
      user_id: params.userId,
      brand_id: run.brandId,
      topic: run.topic,
      primary_keyword: run.primaryKeyword,
      article_title: run.articleTitle,
      article_markdown: run.articleMarkdown,
      meta_description: run.metaDescription,
      url_slug: run.urlSlug,
      seo_title: run.seoTitle,
      image_summary: run.imageAltText,
      stage: "article_done",
      approved: false,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Could not clone content run: ${error.message}`);
  return toRun(data);
}

export async function updateRunInDb(runId: string, patch: Partial<ContentRun>) {
  const supabase = getSupabaseServerClient();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.articleTitle !== undefined) updates.article_title = patch.articleTitle;
  if (patch.articleMarkdown !== undefined) updates.article_markdown = patch.articleMarkdown;
  if (patch.metaDescription !== undefined) updates.meta_description = patch.metaDescription;
  if (patch.stage !== undefined) updates.stage = patch.stage;
  if (patch.approved !== undefined) updates.approved = patch.approved;
  if (patch.urlSlug !== undefined) updates.url_slug = patch.urlSlug;
  if (patch.seoTitle !== undefined) updates.seo_title = patch.seoTitle;
  if (patch.imageAltText !== undefined) updates.image_summary = patch.imageAltText;

  const { data, error } = await supabase
    .from("content_runs")
    .update(updates)
    .eq("id", runId)
    .select("*")
    .single();

  if (error) throw new Error(`Could not update content run: ${error.message}`);
  return toRun(data);
}

export async function saveGeneratedImageInDb(params: {
  runId: string;
  angleId: number;
  angleLabel: string;
  prompt: string;
  userFeedback?: string;
  imageUrl: string;
  storageKey: string | null;
}) {
  const supabase = getSupabaseServerClient();
  await supabase
    .from("generated_images")
    .delete()
    .eq("run_id", params.runId)
    .eq("angle_id", params.angleId);

  const { data, error } = await supabase
    .from("generated_images")
    .insert({
      id: crypto.randomUUID(),
      run_id: params.runId,
      angle_id: params.angleId,
      angle_label: params.angleLabel,
      prompt: params.prompt,
      user_feedback: params.userFeedback || null,
      image_url: params.imageUrl,
      storage_key: params.storageKey,
      generation_count: 1,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Could not save generated image: ${error.message}`);
  return toImage(data);
}

export function toBrand(row: any): Brand {
  return {
    id: row.id,
    name: row.name,
    logoUrl: row.logo_url,
    styleImageUrl: row.style_image_url,
    masterPrompt: row.master_prompt || "",
    cmsUrl: row.cms_url,
    cmsEmail: row.cms_email,
    cmsPassword: row.cms_password,
    cmsCollectionSlug: row.cms_collection_slug || "posts",
    linkedinOrganizationId: row.linkedin_organization_id || null,
    linkedinAccessToken: row.linkedin_access_token || null,
    linkedinAccessTokenExpiresAt: row.linkedin_access_token_expires_at || null,
    linkedinPersonUrn: row.linkedin_person_urn || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

export function toUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name || row.email,
    avatarUrl: row.avatar_url,
    role: row.role || "user",
  };
}

export function toRun(row: any): ContentRun {
  const slug = row.url_slug || slugify(row.article_title || row.topic);
  const seoTitle = row.seo_title || row.article_title || row.topic;
  const metaDescription = row.meta_description || "";

  return {
    id: row.id,
    brandId: row.brand_id,
    topic: row.topic,
    primaryKeyword: row.primary_keyword,
    urlSlug: slug,
    seoTitle,
    articleTitle: row.article_title || seoTitle,
    articleMarkdown: row.article_markdown || "",
    metaDescription,
    ogTitle: seoTitle,
    ogDescription: metaDescription,
    imageAltText: row.image_summary || `${row.topic} article image`,
    canonicalUrl: `https://mocko.ai/blog/${slug}`,
    stage: row.stage || "pending",
    approved: Boolean(row.approved),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

export function toImage(row: any): GeneratedImage {
  return {
    id: row.id,
    runId: row.run_id,
    angleId: row.angle_id,
    angleLabel: row.angle_label,
    prompt: row.prompt,
    userFeedback: row.user_feedback || "",
    imageUrl: row.image_url,
    createdAt: row.created_at,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
