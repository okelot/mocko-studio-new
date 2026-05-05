import { NextResponse } from "next/server";
import { IMAGE_ANGLES, generateImage } from "@/lib/content";
import { createGenerationLogger, summarizeForLog, type GenerationLogger } from "@/lib/generation-logger";
import { getSupabaseServerClient, uploadDataImageToStorage } from "@/lib/supabase-server";
import { saveGeneratedImageInDb, toBrand } from "@/lib/studio-db";
import type { Brand } from "@/lib/types";

export async function POST(request: Request) {
  const logger = createGenerationLogger("image-route");
  try {
    logger.info("request received");
    const body = (await request.json()) as {
      articleTitle?: string;
      angleId?: number;
      runId?: string;
      userId?: string;
      brandId?: string;
      brand?: Brand;
      userFeedback?: string;
    };

    logger.info("request parsed", {
      articleTitle: summarizeForLog(body.articleTitle),
      angleId: body.angleId,
      runId: body.runId,
      userId: body.userId,
      brandId: body.brandId,
      hasInlineBrand: Boolean(body.brand),
      hasUserFeedback: Boolean(body.userFeedback),
    });

    if (!body.articleTitle || !body.angleId) {
      logger.info("request rejected", { reason: "missing_required_fields" });
      return NextResponse.json({ error: "Article title and angle are required." }, { status: 400 });
    }

    const angle = IMAGE_ANGLES.find((item) => item.id === body.angleId);
    if (!angle) {
      logger.info("request rejected", { reason: "invalid_angle", angleId: body.angleId });
      return NextResponse.json({ error: "Invalid image angle." }, { status: 400 });
    }
    logger.info("angle resolved", { angleId: angle.id, angleLabel: angle.label });

    const brand = await resolveBrand(body, logger);
    if (!brand) {
      logger.info("brand lookup failed", { userId: body.userId, brandId: body.brandId });
      return NextResponse.json({ error: "Brand not found." }, { status: 404 });
    }
    logger.info("brand resolved", {
      brandId: brand.id,
      brandName: summarizeForLog(brand.name),
      hasLogo: Boolean(brand.logoUrl),
      hasStyleImage: Boolean(brand.styleImageUrl),
    });

    const prompt = `${angle.description} for "${body.articleTitle}"`;
    logger.info("image generation started", { runId: body.runId, angleId: angle.id });
    const generatedImage = await withTimeout(
      generateImage(body.articleTitle, angle, brand, body.userFeedback, { logger }),
      Number(process.env.OPENAI_IMAGE_TIMEOUT_MS || 210000),
      "OpenAI image generation timed out. Try regenerating this image.",
    );
    logger.info("image generation completed", {
      resultType: generatedImage.startsWith("data:") ? "base64" : "url",
      runId: body.runId,
      angleId: angle.id,
    });
    const safeTitle = body.articleTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    logger.info("image upload started", { bucket: "mocko-studio", runId: body.runId, angleId: angle.id });
    const uploaded = await uploadDataImageToStorage(
      generatedImage,
      "mocko-studio",
      `images/${body.runId || safeTitle || "article"}-angle${angle.id}-${Date.now()}`,
      logger,
    );
    const imageUrl = uploaded.publicUrl;
    logger.info("image upload completed", {
      storageKey: uploaded.storageKey,
      persistedToStorage: Boolean(uploaded.storageKey),
    });

    logger.info("image metadata save started", { runId: body.runId, angleId: angle.id });
    const image = body.runId
      ? await saveGeneratedImageInDb({
          runId: body.runId,
          angleId: angle.id,
          angleLabel: angle.label,
          prompt,
          userFeedback: body.userFeedback,
          imageUrl,
          storageKey: uploaded.storageKey,
        })
      : {
          id: `image-${Date.now()}`,
          runId: body.runId || "",
          angleId: angle.id,
          angleLabel: angle.label,
          prompt,
          userFeedback: body.userFeedback || "",
          imageUrl,
          createdAt: new Date().toISOString(),
        };
    logger.info("image metadata save completed", { imageId: image.id, runId: image.runId, angleId: image.angleId });

    return NextResponse.json({
      image,
    });
  } catch (error) {
    logger.error("request failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate image." },
      { status: 500 },
    );
  }
}

async function resolveBrand(body: { brand?: Brand; brandId?: string; userId?: string }, logger: GenerationLogger) {
  if (body.brandId && body.userId) {
    const supabase = getSupabaseServerClient();
    logger.info("brand lookup started", { userId: body.userId, brandId: body.brandId });
    const { data, error } = await supabase
      .from("brands")
      .select("*")
      .eq("id", body.brandId)
      .eq("user_id", body.userId)
      .single();
    if (error || !data) {
      logger.info("brand lookup returned empty", { error: error?.message });
      return null;
    }
    return toBrand(data);
  }

  logger.info("using inline brand payload");
  return body.brand || null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}
