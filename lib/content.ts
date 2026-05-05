import OpenAI, { toFile } from "openai";
import { createGenerationLogger, summarizeForLog, type GenerationLogger } from "./generation-logger";
import { ARTICLE_MODELS, type ArticleModelId, type Brand } from "./types";

export interface ArticleResult {
  title: string;
  markdown: string;
  metaDescription: string;
}

interface ArticleGenerationDeps {
  openai?: {
    responses: {
      create: (params: unknown) => Promise<unknown>;
    };
  };
  fetch?: typeof fetch;
  logger?: GenerationLogger;
  requestId?: string;
}

export interface ImageAngle {
  id: number;
  label: string;
  description: string;
}

export const IMAGE_ANGLES: ImageAngle[] = [
  {
    id: 1,
    label: "Overview",
    description: "A clean, professional overview image that represents the topic broadly. Match the brand visual style.",
  },
  {
    id: 2,
    label: "Action",
    description: "A dynamic, action-oriented image showing someone actively engaged with the topic. Match the brand visual style.",
  },
  {
    id: 3,
    label: "Outcome",
    description: "A positive outcome/result image showing success or achievement related to the topic. Match the brand visual style.",
  },
];

export class ProviderConfigError extends Error {
  status = 400;
}

let openai: OpenAI | null = null;

export function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new ProviderConfigError("OPENAI_API_KEY is not configured.");
  }

  openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

export async function generateArticle(
  topic: string,
  keyword: string,
  masterPrompt: string,
  modelId: ArticleModelId = "openai:gpt-5.4",
  deps: ArticleGenerationDeps = {},
): Promise<ArticleResult> {
  const logger = deps.logger ?? createGenerationLogger("article", deps.requestId);
  const systemPrompt =
    masterPrompt ||
    "You are an expert SEO content writer. Write comprehensive, well-structured blog articles optimized for search engines. Follow E-E-A-T principles. Always return valid JSON.";

  const userPrompt = `Write a complete SEO-optimized blog article about: "${topic}"
Primary keyword to target: "${keyword}"

Return a JSON object with exactly these fields:
{
  "title": "SEO-optimized article title (include keyword)",
  "metaDescription": "150-160 character meta description including keyword",
  "markdown": "Full article in markdown format, 1200-1800 words, with H2/H3 subheadings, bullet points where appropriate, and a clear call to action at the end"
}

Return ONLY valid JSON. No preamble, no markdown code fences.`;

  const model = ARTICLE_MODELS.find((item) => item.id === modelId);
  if (!model) {
    throw new Error("Unsupported article model selected.");
  }

  logger.info("provider selected", {
    provider: model.provider,
    model: model.apiModel,
    topic: summarizeForLog(topic),
    keyword: summarizeForLog(keyword),
    hasMasterPrompt: Boolean(masterPrompt),
  });

  if (model.provider === "anthropic") {
    return generateAnthropicArticle(
      systemPrompt,
      userPrompt,
      process.env.ANTHROPIC_TEXT_MODEL || model.apiModel,
      deps.fetch,
      logger,
    );
  }

  const openaiClient = deps.openai ?? getOpenAI();
  const requestStartedAt = Date.now();
  logger.info("openai article request started", { model: model.apiModel });
  const response = await openaiClient.responses.create({
    model: model.apiModel,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "article_result",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["title", "metaDescription", "markdown"],
          properties: {
            title: { type: "string" },
            metaDescription: { type: "string" },
            markdown: { type: "string" },
          },
        },
      },
    },
  } as any);
  logger.info("openai article request completed", {
    model: model.apiModel,
    durationMs: Date.now() - requestStartedAt,
  });

  const text = (response as any).output_text;
  if (!text) {
    throw new Error("OpenAI did not return article text.");
  }

  const parsed = parseArticleJson(text, "OpenAI");
  if (!parsed.title || !parsed.markdown || !parsed.metaDescription) {
    throw new Error("Invalid article structure returned.");
  }

  logger.info("article parsed", {
    title: summarizeForLog(parsed.title),
    markdownChars: parsed.markdown.length,
    metaDescriptionChars: parsed.metaDescription.length,
  });

  return parsed;
}

async function generateAnthropicArticle(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
  logger = createGenerationLogger("article"),
): Promise<ArticleResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ProviderConfigError("ANTHROPIC_API_KEY is not configured.");
  }

  const maxTokens = Number(process.env.ANTHROPIC_MAX_TOKENS || 6400);
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    throw new ProviderConfigError("ANTHROPIC_MAX_TOKENS must be a positive number.");
  }

  const requestStartedAt = Date.now();
  logger.info("anthropic article request started", { model, maxTokens });
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  logger.info("anthropic article response received", {
    model,
    status: response.status,
    durationMs: Date.now() - requestStartedAt,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic article generation failed: ${errorText || response.statusText}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = payload.content?.find((item) => item.type === "text" && item.text)?.text;
  if (!text) {
    throw new Error("Anthropic did not return article text.");
  }

  const parsed = parseArticleJson(stripJsonFence(text), "Anthropic");
  if (!parsed.title || !parsed.markdown || !parsed.metaDescription) {
    throw new Error("Invalid article structure returned.");
  }

  logger.info("article parsed", {
    title: summarizeForLog(parsed.title),
    markdownChars: parsed.markdown.length,
    metaDescriptionChars: parsed.metaDescription.length,
  });

  return parsed;
}

function stripJsonFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
}

function parseArticleJson(value: string, provider: string): ArticleResult {
  try {
    return JSON.parse(value) as ArticleResult;
  } catch {
    throw new Error(`${provider} returned article content that was not valid JSON.`);
  }
}

export async function generateImage(
  articleTitle: string,
  angle: ImageAngle,
  brand: Brand,
  userFeedback?: string,
  options: { logger?: GenerationLogger; requestId?: string } = {},
) {
  const logger = options.logger ?? createGenerationLogger("image", options.requestId);
  logger.info("image prompt preparation started", {
    articleTitle: summarizeForLog(articleTitle),
    angleId: angle.id,
    angleLabel: angle.label,
    brandId: brand.id,
    brandName: summarizeForLog(brand.name),
    hasUserFeedback: Boolean(userFeedback),
    hasLogo: Boolean(brand.logoUrl),
    hasStyleImage: Boolean(brand.styleImageUrl),
  });
  const inputImages = await getBrandInputImages(brand, logger);
  const brandContext =
    "Use the first input image as the brand logo for brand identity and visual constraints. Use the second input image as the style reference for color palette, lighting, composition, and aesthetic direction.";

  const prompt = `Create a high-quality, professional blog header image for an article titled: "${articleTitle}"

Angle: ${angle.label} - ${angle.description}
Brand: ${brand.name}
${brandContext}${userFeedback ? `\n\nUser feedback for this regeneration: ${userFeedback}` : ""}

Requirements:
- Professional editorial quality
- No text overlaid on the image
- Suitable as a blog article header, landscape orientation
- Clean, visually appealing composition
- Modern and polished aesthetic`;

  const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const imageSize = process.env.OPENAI_IMAGE_SIZE || "1536x1024";
  const imageQuality = process.env.OPENAI_IMAGE_QUALITY || "medium";
  const requestStartedAt = Date.now();
  logger.info("openai image request started", {
    model: imageModel,
    inputImageCount: inputImages.length,
    size: imageSize,
    quality: imageQuality,
  });
  const response = await getOpenAI().images.edit({
    model: imageModel,
    image: inputImages,
    prompt,
    n: 1,
    size: imageSize,
    quality: imageQuality,
    output_format: "png",
  } as any);
  logger.info("openai image request completed", {
    model: imageModel,
    durationMs: Date.now() - requestStartedAt,
  });

  const image = response.data?.[0] as { b64_json?: string; url?: string } | undefined;
  if (!image) {
    throw new Error("No image returned from OpenAI.");
  }

  if (image.b64_json) {
    logger.info("image result received", { resultType: "base64" });
    return `data:image/png;base64,${image.b64_json}`;
  }

  if (image.url) {
    logger.info("image result received", { resultType: "url" });
    return image.url;
  }

  throw new Error("No usable image data returned from OpenAI.");
}

async function getBrandInputImages(brand: Brand, logger: GenerationLogger) {
  if (!brand.logoUrl || !brand.styleImageUrl) {
    throw new Error("Brand logo and style reference are required for image generation.");
  }

  const inputs: File[] = [];
  logger.info("brand logo input loading started");
  inputs.push(await urlToFile(brand.logoUrl, "brand-logo"));
  logger.info("brand logo input loaded");
  logger.info("style reference input loading started");
  inputs.push(await urlToFile(brand.styleImageUrl, "style-reference"));
  logger.info("style reference input loaded");
  return inputs;
}

async function urlToFile(url: string, name: string) {
  if (url.startsWith("data:")) {
    const [header, base64] = url.split(",");
    const mime = header.match(/data:(.*?);base64/)?.[1] || "image/png";
    const extension = mime.split("/")[1]?.replace("jpeg", "jpg") || "png";
    return toFile(Buffer.from(base64, "base64"), `${name}.${extension}`, { type: mime });
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch brand image: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const extension = contentType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return toFile(buffer, `${name}.${extension}`, { type: contentType });
}

export async function publishToPayloadCMS(payload: {
  cmsUrl: string;
  cmsEmail: string;
  cmsPassword: string;
  collectionSlug: string;
  article: {
    title: string;
    content: string;
    metaDescription: string;
    keyword: string;
  };
  imageUrls: string[];
}) {
  const loginRes = await fetch(`${payload.cmsUrl.replace(/\/$/, "")}/api/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: payload.cmsEmail, password: payload.cmsPassword }),
  });

  if (!loginRes.ok) {
    throw new Error(`Payload CMS login failed: ${await loginRes.text()}`);
  }

  const { token } = (await loginRes.json()) as { token: string };
  const postRes = await fetch(`${payload.cmsUrl.replace(/\/$/, "")}/api/${payload.collectionSlug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `JWT ${token}` },
    body: JSON.stringify({
      title: payload.article.title,
      content: payload.article.content,
      meta: { description: payload.article.metaDescription },
      featuredImage: payload.imageUrls[0] || null,
      status: "draft",
    }),
  });

  if (!postRes.ok) {
    throw new Error(`Failed to create post: ${await postRes.text()}`);
  }

  const postData = (await postRes.json()) as { doc?: { id: string }; id?: string };
  return postData.doc?.id || postData.id || "";
}
