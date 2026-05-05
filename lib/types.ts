export type Page = "generate" | "brands" | "history";

export const ARTICLE_MODELS = [
  { id: "openai:gpt-5.4", label: "GPT-5.4", provider: "openai", apiModel: "gpt-5.4" },
  { id: "openai:gpt-5.5", label: "GPT-5.5", provider: "openai", apiModel: "gpt-5.5" },
  { id: "anthropic:claude", label: "Anthropic Claude", provider: "anthropic", apiModel: "claude-sonnet-4-5" },
] as const;

export type ArticleModelId = (typeof ARTICLE_MODELS)[number]["id"];

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
}

export interface Brand {
  id: string;
  name: string;
  logoUrl: string | null;
  styleImageUrl: string | null;
  masterPrompt: string;
  cmsUrl: string | null;
  cmsEmail: string | null;
  cmsPassword: string | null;
  cmsCollectionSlug: string | null;
  linkedinOrganizationId: string | null;
  linkedinAccessToken: string | null;
  linkedinAccessTokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RunStage =
  | "pending"
  | "generating_article"
  | "article_done"
  | "generating_images"
  | "complete"
  | "approved"
  | "published";

export interface ContentRun {
  id: string;
  brandId: string;
  topic: string;
  primaryKeyword: string;
  urlSlug: string;
  seoTitle: string;
  articleTitle: string;
  articleMarkdown: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  imageAltText: string;
  canonicalUrl: string;
  stage: RunStage;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedImage {
  id: string;
  runId: string;
  angleId: number;
  angleLabel: string;
  prompt: string;
  userFeedback: string;
  imageUrl: string | null;
  createdAt: string;
}

export interface PayloadCategory {
  id: string | number;
  name: string;
  slug: string;
}

export interface StudioData {
  user: User | null;
  activeRunId: string | null;
  brands: Brand[];
  runs: ContentRun[];
  images: GeneratedImage[];
}
