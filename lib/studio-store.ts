import type { Brand, ContentRun, GeneratedImage, StudioData, User } from "./types";

const STORAGE_KEY = "mocko-new-studio:v1";

const demoUser: User = {
  id: "user-demo",
  email: "editor@mocko.ai",
  name: "Mocko Editor",
  avatarUrl: null,
  role: "admin",
};

const now = new Date().toISOString();

const demoBrands: Brand[] = [
  {
    id: "brand-mocko",
    name: "Mocko.ai",
    logoUrl: null,
    styleImageUrl: null,
    masterPrompt:
      "Write practical, expert-level language-test content for Canadian immigration candidates. Keep the tone clear, encouraging, and specific.",
    cmsUrl: "https://cms.mocko.ai",
    cmsEmail: "admin@mocko.ai",
    cmsPassword: "",
    cmsCollectionSlug: "posts",
    linkedinOrganizationId: null,
    linkedinAccessToken: null,
    linkedinAccessTokenExpiresAt: null,
    linkedinPersonUrn: null,
    createdAt: now,
    updatedAt: now,
  },
];

const demoRuns: ContentRun[] = [
  {
    id: "run-demo",
    brandId: "brand-mocko",
    topic: "PTE Respond to a Situation",
    primaryKeyword: "pte respond to a situation",
    urlSlug: "pte-respond-to-a-situation-complete-practice-guide",
    seoTitle: "PTE Respond to a Situation: Complete Practice Guide",
    articleTitle: "PTE Respond to a Situation: Complete Practice Guide",
    articleMarkdown:
      "# PTE Respond to a Situation\n\nThis guide explains how to understand the prompt, structure your response, and keep your delivery natural under exam pressure.\n\n## What matters most\n\nStart with the purpose, choose a polite tone, and answer every part of the situation in a clear sequence.",
    metaDescription:
      "Learn how to answer PTE Respond to a Situation prompts with clear structure, natural phrasing, and exam-ready practice tips.",
    ogTitle: "PTE Respond to a Situation Practice Guide",
    ogDescription:
      "A practical guide to structure, tone, and timing for PTE Respond to a Situation tasks.",
    imageAltText: "Student practicing a PTE speaking response at a desk",
    canonicalUrl: "https://mocko.ai/blog/pte-respond-to-a-situation-complete-practice-guide",
    stage: "complete",
    approved: false,
    createdAt: now,
    updatedAt: now,
  },
];

const demoImages: GeneratedImage[] = [
  {
    id: "image-demo-1",
    runId: "run-demo",
    angleId: 1,
    angleLabel: "Hero",
    prompt: "Editorial hero image for PTE study planning",
    userFeedback: "",
    imageUrl: null,
    createdAt: now,
  },
  {
    id: "image-demo-2",
    runId: "run-demo",
    angleId: 2,
    angleLabel: "Practice",
    prompt: "Student practicing a spoken response",
    userFeedback: "",
    imageUrl: null,
    createdAt: now,
  },
  {
    id: "image-demo-3",
    runId: "run-demo",
    angleId: 3,
    angleLabel: "Results",
    prompt: "Clean study dashboard showing progress",
    userFeedback: "",
    imageUrl: null,
    createdAt: now,
  },
];

export function createDefaultData(): StudioData {
  return {
    user: null,
    activeRunId: "run-demo",
    brands: demoBrands,
    runs: demoRuns,
    images: demoImages,
  };
}

export function loadStudioData(): StudioData {
  if (typeof window === "undefined") {
    return createDefaultData();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createDefaultData();
  }

  try {
    return normalizeStudioData({ ...createDefaultData(), ...JSON.parse(raw) });
  } catch {
    return createDefaultData();
  }
}

export function saveStudioData(data: StudioData) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Unable to persist Mocko Studio data locally.", error);
  }
}

export function signInDemoUser(data: StudioData): StudioData {
  return { ...data, user: demoUser };
}

export function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStudioData(data: StudioData): StudioData {
  return {
    ...data,
    activeRunId: data.activeRunId ?? data.runs[0]?.id ?? null,
    runs: data.runs.map((run) => {
      const slug = (run as Partial<ContentRun>).urlSlug || slugify(run.articleTitle || run.topic);
      const seoTitle = (run as Partial<ContentRun>).seoTitle || run.articleTitle;
      const metaDescription = run.metaDescription || "";
      return {
        ...run,
        urlSlug: slug,
        seoTitle,
        metaDescription,
        ogTitle: (run as Partial<ContentRun>).ogTitle || seoTitle,
        ogDescription: (run as Partial<ContentRun>).ogDescription || metaDescription,
        imageAltText:
          (run as Partial<ContentRun>).imageAltText ||
          `${run.topic} article header image`,
        canonicalUrl:
          (run as Partial<ContentRun>).canonicalUrl ||
          `https://mocko.ai/blog/${slug}`,
      };
    }),
    brands: data.brands.map((brand) => ({
      ...brand,
      linkedinOrganizationId: (brand as Partial<Brand>).linkedinOrganizationId || null,
      linkedinAccessToken: (brand as Partial<Brand>).linkedinAccessToken || null,
      linkedinAccessTokenExpiresAt: (brand as Partial<Brand>).linkedinAccessTokenExpiresAt || null,
    })),
    images: data.images.map((image) => ({
      ...image,
      userFeedback: (image as Partial<GeneratedImage>).userFeedback || "",
    })),
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
