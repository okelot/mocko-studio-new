import { NextResponse } from "next/server";
import { ProviderConfigError, generateArticle } from "@/lib/content";
import { createGenerationLogger, summarizeForLog } from "@/lib/generation-logger";
import { createRunInDb, ensurePublicUser, toBrand } from "@/lib/studio-db";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ARTICLE_MODELS, type ArticleModelId, type User } from "@/lib/types";

export async function POST(request: Request) {
  const logger = createGenerationLogger("article-route");
  try {
    logger.info("request received");
    const body = (await request.json()) as {
      topic?: string;
      primaryKeyword?: string;
      masterPrompt?: string;
      userId?: string;
      user?: User;
      brandId?: string;
      articleModelId?: ArticleModelId;
    };

    logger.info("request parsed", {
      topic: summarizeForLog(body.topic),
      keyword: summarizeForLog(body.primaryKeyword),
      userId: body.userId,
      brandId: body.brandId,
      articleModelId: body.articleModelId,
      hasMasterPromptOverride: Boolean(body.masterPrompt),
    });

    if (!body.topic || !body.primaryKeyword || !body.userId || !body.brandId) {
      logger.info("request rejected", { reason: "missing_required_fields" });
      return NextResponse.json({ error: "Topic, keyword, user, and brand are required." }, { status: 400 });
    }

    // Resolve the effective DB user ID (may differ from auth UUID if user was
    // previously stored under a different auth UUID but the same email).
    let effectiveUserId = body.userId;
    if (body.user) {
      const dbUser = await ensurePublicUser(body.user);
      effectiveUserId = dbUser.id;
    }

    const supabase = getSupabaseServerClient();
    logger.info("brand lookup started", { userId: effectiveUserId, brandId: body.brandId });
    const { data: brandRow, error: brandError } = await supabase
      .from("brands")
      .select("*")
      .eq("id", body.brandId)
      .eq("user_id", effectiveUserId)
      .single();

    if (brandError || !brandRow) {
      logger.info("brand lookup failed", {
        userId: body.userId,
        brandId: body.brandId,
        error: brandError?.message,
      });
      return NextResponse.json({ error: "Brand not found." }, { status: 404 });
    }

    const brand = toBrand(brandRow);
    logger.info("brand loaded", {
      brandId: brand.id,
      brandName: summarizeForLog(brand.name),
      hasLogo: Boolean(brand.logoUrl),
      hasStyleImage: Boolean(brand.styleImageUrl),
    });
    const articleModelId = ARTICLE_MODELS.some((model) => model.id === body.articleModelId)
      ? body.articleModelId
      : "openai:gpt-5.4";
    logger.info("article generation started", { articleModelId });
    const article = await generateArticle(
      body.topic,
      body.primaryKeyword,
      body.masterPrompt || brand.masterPrompt,
      articleModelId,
      { logger },
    );
    logger.info("article generation completed", {
      title: summarizeForLog(article.title),
      markdownChars: article.markdown.length,
    });
    logger.info("run save started", { userId: body.userId, brandId: body.brandId });
    const run = await createRunInDb({
      userId: body.userId,
      brandId: body.brandId,
      topic: body.topic,
      primaryKeyword: body.primaryKeyword,
      title: article.title,
      markdown: article.markdown,
      metaDescription: article.metaDescription,
      urlSlug: slugify(article.title),
      imageSummary: `${body.topic} article header image`,
    });
    logger.info("run save completed", { runId: run.id, stage: run.stage });

    return NextResponse.json({ article, run, brand });
  } catch (error) {
    const status = getErrorStatus(error);
    logger.error("request failed", error, { status });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate article." },
      { status },
    );
  }
}

function getErrorStatus(error: unknown) {
  if (error instanceof ProviderConfigError) {
    return error.status;
  }

  const status = typeof error === "object" && error ? (error as { status?: unknown }).status : undefined;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return status;
  }

  return 500;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
