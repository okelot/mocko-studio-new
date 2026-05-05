import { NextResponse } from "next/server";
import { sendGeneratedArticleWebhook, type GeneratedArticleWebhookPayload } from "@/lib/article-webhook";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { toBrand, toImage, toRun } from "@/lib/studio-db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      runId?: string;
      userId?: string;
    };

    if (!body.runId || !body.userId) {
      return NextResponse.json({ error: "Run and user are required." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: runRow, error: runError } = await supabase
      .from("content_runs")
      .select("*")
      .eq("id", body.runId)
      .eq("user_id", body.userId)
      .single();

    if (runError || !runRow) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }

    const { data: brandRow } = await supabase.from("brands").select("*").eq("id", runRow.brand_id).maybeSingle();
    const { data: imageRows, error: imageError } = await supabase
      .from("generated_images")
      .select("*")
      .eq("run_id", body.runId)
      .order("angle_id", { ascending: true });

    if (imageError) {
      throw new Error(`Could not load generated images: ${imageError.message}`);
    }

    const run = toRun(runRow);
    const brand = brandRow ? toBrand(brandRow) : null;
    const images = (imageRows || []).map(toImage);
    const imageUrls = images.map((image) => image.imageUrl).filter((url): url is string => Boolean(url));

    const payload: GeneratedArticleWebhookPayload = {
      event: "generated_article.complete",
      sentAt: new Date().toISOString(),
      run,
      brand,
      images,
      imageUrls,
      article: {
        title: run.articleTitle,
        markdown: run.articleMarkdown,
        metaDescription: run.metaDescription,
        primaryKeyword: run.primaryKeyword,
        topic: run.topic,
        urlSlug: run.urlSlug,
        canonicalUrl: run.canonicalUrl,
        seoTitle: run.seoTitle,
        ogTitle: run.ogTitle,
        ogDescription: run.ogDescription,
        imageAltText: run.imageAltText,
      },
    };

    const result = await sendGeneratedArticleWebhook(payload);

    return NextResponse.json({
      ok: true,
      skipped: result.skipped,
      imageCount: images.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send generated article webhook." },
      { status: 500 },
    );
  }
}
