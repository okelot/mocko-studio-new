import type { Brand, ContentRun, GeneratedImage } from "./types";

export interface GeneratedArticleWebhookPayload {
  event: "generated_article.complete";
  sentAt: string;
  run: ContentRun;
  brand: Brand | null;
  images: GeneratedImage[];
  imageUrls: string[];
  article: {
    title: string;
    markdown: string;
    metaDescription: string;
    primaryKeyword: string;
    topic: string;
    urlSlug: string;
    canonicalUrl: string;
    seoTitle: string;
    ogTitle: string;
    ogDescription: string;
    imageAltText: string;
  };
}

export async function sendGeneratedArticleWebhook(payload: GeneratedArticleWebhookPayload) {
  const webhookUrl = process.env.GENERATED_ARTICLE_WEBHOOK_URL;
  if (!webhookUrl) {
    return { skipped: true };
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Generated article webhook failed: ${response.status} ${errorText || response.statusText}`);
  }

  return { skipped: false };
}
