"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { ToastProvider, useToast } from "@/components/toast-provider";
import {
  createDefaultData,
  loadStudioData,
  makeId,
  saveStudioData,
} from "@/lib/studio-store";
import { isSupabaseConfigured, missingSupabaseConfig, supabase } from "@/lib/supabase-client";
import {
  ARTICLE_MODELS,
  type ArticleModelId,
  type Brand,
  type ContentRun,
  type GeneratedImage,
  type Page,
  type StudioData,
} from "@/lib/types";

const stages: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-slate-400" },
  generating_article: { label: "Generating", color: "text-blue-400" },
  article_done: { label: "Article ready", color: "text-blue-300" },
  generating_images: { label: "Generating images", color: "text-cyan-400" },
  complete: { label: "Ready to approve", color: "text-amber-300" },
  approved: { label: "Approved", color: "text-emerald-300" },
  published: { label: "Published", color: "text-purple-300" },
};

const articleGenerationAutofill = {
  topic: "PTE Respond to a Situation",
  primaryKeyword: "pte respond to a situation",
  articleModelId: "openai:gpt-5.4" as ArticleModelId,
};

function AppShell() {
  const { toast } = useToast();
  const [data, setData] = useState<StudioData>(createDefaultData);
  const [page, setPage] = useState<Page>("generate");
  const [hydrated, setHydrated] = useState(false);
  const loadedDbUserRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = loadStudioData();
    setData(stored);

    async function loadSession() {
      if (!supabase) {
        setHydrated(true);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        setHydrated(true);
        return;
      }
      setData((current) => ({
        ...current,
        user: {
          id: user.id,
          email: user.email ?? "",
          name:
            (user.user_metadata?.full_name as string | undefined) ||
            (user.user_metadata?.name as string | undefined) ||
            user.email ||
            "Mocko user",
          avatarUrl: (user.user_metadata?.avatar_url as string | undefined) || null,
          role: "user",
        },
      }));
      setHydrated(true);
    }

    void loadSession();

    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (!user) {
        if (_event === "SIGNED_OUT") {
          setData((current) => ({ ...current, user: null }));
        }
        return;
      }
      setData((current) => ({
        ...current,
        user: {
          id: user.id,
          email: user.email ?? "",
          name:
            (user.user_metadata?.full_name as string | undefined) ||
            (user.user_metadata?.name as string | undefined) ||
            user.email ||
            "Mocko user",
          avatarUrl: (user.user_metadata?.avatar_url as string | undefined) || null,
          role: "user",
        },
      }));
    });

    return () => subscription?.data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (hydrated) {
      saveStudioData(data);
    }
  }, [data, hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const url = new URL(window.location.href);
    const linkedinStatus = url.searchParams.get("linkedin");
    if (!linkedinStatus) {
      return;
    }

    if (linkedinStatus === "connected") {
      toast("LinkedIn connected. Reloading brand settings.");
      if (data.user) {
        void postJson<{ data: StudioData }>("/api/studio", { user: data.user }).then((result) => {
          setData(result.data);
        });
      }
    } else if (linkedinStatus === "error") {
      toast(url.searchParams.get("message") || "LinkedIn connection failed", "error");
    }

    url.searchParams.delete("linkedin");
    url.searchParams.delete("message");
    window.history.replaceState({}, "", url.toString());
  }, [data.user, hydrated, toast]);

  useEffect(() => {
    if (!hydrated || !data.user || loadedDbUserRef.current === data.user.id) {
      return;
    }

    loadedDbUserRef.current = data.user.id;
    void postJson<{ data: StudioData }>("/api/studio", { user: data.user })
      .then((result) => {
        setData(result.data);
      })
      .catch((error) => {
        loadedDbUserRef.current = null;
        toast(error instanceof Error ? error.message : "Could not load database data", "error");
      });
  }, [data.user, hydrated, toast]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080d18]">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!data.user) {
    return (
      <LoginPage
        onAuthenticated={(user) => {
          setData((current) => ({ ...current, user }));
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#080d18]">
      <Header
        page={page}
        setPage={setPage}
        userName={data.user.name}
        onLogout={async () => {
          await supabase?.auth.signOut();
          setData((current) => ({ ...current, user: null }));
        }}
      />
      <main>
        {page === "generate" && <GeneratePage data={data} setData={setData} />}
        {page === "brands" && <BrandsPage data={data} setData={setData} />}
        {page === "history" && <HistoryPage data={data} setData={setData} />}
      </main>
    </div>
  );
}

function Header({
  page,
  setPage,
  userName,
  onLogout,
}: {
  page: Page;
  setPage: (page: Page) => void;
  userName: string;
  onLogout: () => void;
}) {
  const navItems: { id: Page; label: string }[] = [
    { id: "generate", label: "Generate" },
    { id: "brands", label: "Brands" },
    { id: "history", label: "History" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-[#080d18]/95 px-4 backdrop-blur md:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-6 md:gap-10">
          <div className="flex shrink-0 items-center gap-2.5 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/20">
              <Icon name="spark" className="h-4 w-4" />
            </div>
            <span className="font-bold tracking-tight text-white">
              Mocko <span className="text-cyan-400">Studio</span>
            </span>
          </div>
          <nav className="flex items-center">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`border-b-2 px-3 py-[18px] text-sm font-medium transition-colors md:px-4 ${
                  page === item.id
                    ? "border-cyan-400 text-cyan-300"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 pb-3 md:pb-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/15 text-sm font-bold text-cyan-300 ring-1 ring-blue-500/20">
            {userName[0]}
          </div>
          <span className="hidden text-sm font-medium text-slate-300 sm:inline">{userName.split(" ")[0]}</span>
          <button
            onClick={onLogout}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-900 hover:text-slate-200"
            title="Sign out"
          >
            <Icon name="logout" />
          </button>
        </div>
      </div>
    </header>
  );
}

function LoginPage({ onAuthenticated }: { onAuthenticated: (user: NonNullable<StudioData["user"]>) => void }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  async function signIn() {
    if (!supabase) {
      toast("Add Supabase env vars before signing in", "error");
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      toast(error.message, "error");
    }
  }

  async function submitEmailPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      toast("Enter your email and password", "error");
      setAuthMessage("Enter your email and password.");
      return;
    }

    setLoading(true);
    setAuthMessage(null);
    try {
      const result = await postJson<{ user: StudioData["user"] }>(
        mode === "signin" ? "/api/auth/signin" : "/api/auth/signup",
        { email: email.trim(), password },
      );

      if (!result.user) {
        throw new Error("No user returned from Supabase.");
      }

      const current = loadStudioData();
      saveStudioData({ ...current, user: result.user });
      onAuthenticated(result.user);
      toast(mode === "signin" ? "Signed in" : "Account created");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      setAuthMessage(message);
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080d18]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(37,99,235,0.16),transparent_34%),radial-gradient(circle_at_75%_70%,rgba(8,145,178,0.12),transparent_30%)]" />
      <div className="relative z-10 mx-auto w-full max-w-md px-6">
        <div className="mb-10 text-center">
          <div className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-2xl shadow-blue-500/30">
            <Icon name="spark" className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Mocko <span className="text-cyan-400">Studio</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">AI-powered content generation for your brands</p>
        </div>

        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
          <h2 className="mb-1 text-lg font-semibold text-white">{mode === "signin" ? "Welcome back" : "Create account"}</h2>
          <p className="mb-6 text-sm text-slate-400">Use Supabase email and password auth</p>
          <form onSubmit={submitEmailPassword} className="space-y-3">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              placeholder="Email"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500"
            />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="Password"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Please wait" : mode === "signin" ? "Sign In" : "Sign Up"}
            </button>
            {authMessage ? (
              <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                {authMessage}
              </p>
            ) : null}
          </form>

          <button
            onClick={() => setMode((current) => (current === "signin" ? "signup" : "signin"))}
            className="mt-4 w-full text-center text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
          >
            {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-700/50" />
            <span className="text-xs text-slate-500">or</span>
            <div className="h-px flex-1 bg-slate-700/50" />
          </div>

          <button
            onClick={signIn}
            disabled={!isSupabaseConfigured}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3.5 font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GoogleMark />
            Continue with Google
          </button>
          <div className="mt-6 border-t border-slate-700/50 pt-6 text-center">
            <p className="text-xs text-slate-500">
              {isSupabaseConfigured
                ? "Google authentication powered by Supabase"
                : `Google OAuth unavailable: missing ${missingSupabaseConfig.join(", ")}`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-200">
        {label}
        {hint ? <span className="ml-1.5 font-normal text-slate-500">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

function CharBar({ len, max }: { len: number; max: number }) {
  const pct = Math.min((len / max) * 100, 100);
  const color = len > max ? "bg-red-500" : len > max * 0.85 ? "bg-amber-400" : "bg-emerald-400";
  const textColor = len > max ? "text-red-400" : len > max * 0.85 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="mt-0.5 flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums ${textColor}`}>{len}/{max}</span>
    </div>
  );
}

function GeneratePage({
  data,
  setData,
}: {
  data: StudioData;
  setData: React.Dispatch<React.SetStateAction<StudioData>>;
}) {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [brandId, setBrandId] = useState(data.brands[0]?.id ?? "");
  const [articleModelId, setArticleModelId] = useState<ArticleModelId>("openai:gpt-5.4");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingImageIds, setGeneratingImageIds] = useState<number[]>([]);
  const [tweakPrompts, setTweakPrompts] = useState<Record<number, string>>({});
  const [isEdited, setIsEdited] = useState(false);
  const [isSendingToN8n, setIsSendingToN8n] = useState(false);
  const [isPublishingToLinkedIn, setIsPublishingToLinkedIn] = useState(false);
  const [draftLinkedInOrgId, setDraftLinkedInOrgId] = useState("");
  const [draftLinkedInText, setDraftLinkedInText] = useState("");
  const [draftLinkedInImageId, setDraftLinkedInImageId] = useState("");
  const draft = data.runs.find((run) => run.id === data.activeRunId) ?? null;
  const draftImages = draft
    ? data.images.filter((image) => image.runId === draft.id).sort((a, b) => a.angleId - b.angleId)
    : [];
  const draftImageUrlCount = draftImages.filter((image) => image.imageUrl).length;
  const draftBrand = draft ? data.brands.find((brand) => brand.id === draft.brandId) ?? null : null;
  const selectedBrand = data.brands.find((brand) => brand.id === brandId) ?? null;
  const selectedBrandReadyForImages = selectedBrand ? hasBrandImageInputs(selectedBrand) : false;

  useEffect(() => {
    if (!brandId && data.brands[0]) {
      setBrandId(data.brands[0].id);
    }
  }, [brandId, data.brands]);

  useEffect(() => {
    if (!draft) {
      setDraftLinkedInOrgId("");
      setDraftLinkedInText("");
      setDraftLinkedInImageId("");
      return;
    }

    const firstImage = draftImages.find((image) => image.imageUrl);
    setDraftLinkedInOrgId(draftBrand?.linkedinOrganizationId ?? "");
    setDraftLinkedInText(defaultLinkedInText(draft));
    setDraftLinkedInImageId(firstImage?.id ?? "");
  }, [draft?.id, draftBrand?.linkedinOrganizationId]);

  function autofillArticleGeneration() {
    setTopic(articleGenerationAutofill.topic);
    setPrimaryKeyword(articleGenerationAutofill.primaryKeyword);
    setArticleModelId(articleGenerationAutofill.articleModelId);
    setBrandId((current) => current || data.brands[0]?.id || "");
  }

  async function handleGenerate() {
    if (!topic.trim() || !primaryKeyword.trim() || !brandId) {
      toast("Add a brand, topic, and keyword first", "error");
      return;
    }

    setIsGenerating(true);
    setIsEdited(false);
    try {
      const selectedBrand = data.brands.find((brand) => brand.id === brandId);
      if (!selectedBrand) {
        throw new Error("Select a brand before generating.");
      }
      if (!hasBrandImageInputs(selectedBrand)) {
        throw new Error("Add both a brand logo and style reference before generating images.");
      }
      const result = await postJson<{ run: ContentRun; brand: Brand }>(
        "/api/generate-article",
        {
          topic: topic.trim(),
          primaryKeyword: primaryKeyword.trim(),
          articleModelId,
          userId: data.user?.id,
          brandId,
        },
      );

      const run: ContentRun = { ...result.run, stage: "generating_images" };

      setData((current) => ({ ...current, activeRunId: run.id, runs: [run, ...current.runs] }));
      toast("Article draft generated. Creating images now.");
      void generateImagesForRun(run, result.brand).catch((error) => {
        setData((current) => ({
          ...current,
          runs: current.runs.map((item) => (item.id === run.id ? { ...item, stage: "article_done" } : item)),
        }));
        toast(error instanceof Error ? error.message : "Article saved, but image generation failed", "error");
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Article generation failed", "error");
    } finally {
      setIsGenerating(false);
    }
  }

  function updateDraft<K extends keyof ContentRun>(key: K, value: ContentRun[K]) {
    if (!draft) {
      return;
    }

    setData((current) => ({
      ...current,
      runs: current.runs.map((run) =>
        run.id === draft.id ? { ...run, [key]: value, updatedAt: new Date().toISOString() } : run,
      ),
    }));
    void postJson("/api/runs/update", { runId: draft.id, patch: { [key]: value } }).catch(() => {});
    setIsEdited(true);
  }

  async function completeRun() {
    if (!draft) {
      return;
    }

    const selectedBrand = data.brands.find((brand) => brand.id === draft.brandId);
    if (!selectedBrand) {
      toast("Brand not found for this run", "error");
      return;
    }
    if (!hasBrandImageInputs(selectedBrand)) {
      toast("Add both a brand logo and style reference before generating images.", "error");
      return;
    }

    try {
      await generateImagesForRun(draft, selectedBrand);
    } catch (error) {
      setData((current) => ({
        ...current,
        runs: current.runs.map((run) => (run.id === draft.id ? { ...run, stage: "article_done" } : run)),
      }));
      toast(error instanceof Error ? error.message : "Image generation failed", "error");
    }
  }

  async function generateImagesForRun(run: ContentRun, selectedBrand: Brand) {
    if (!hasBrandImageInputs(selectedBrand)) {
      throw new Error("Add both a brand logo and style reference before generating images.");
    }

    setData((current) => ({
      ...current,
      runs: current.runs.map((item) => (item.id === run.id ? { ...item, stage: "generating_images" } : item)),
    }));
    void postJson("/api/runs/update", { runId: run.id, patch: { stage: "generating_images" } }).catch(() => {});
    setGeneratingImageIds([1, 2, 3]);

    const results = await Promise.allSettled(
      [1, 2, 3].map(async (angleId) => {
        const result = await postJson<{
          image: { angleId: number; angleLabel: string; prompt: string; imageUrl: string };
        }>("/api/generate-image", {
          articleTitle: run.articleTitle,
          angleId,
          runId: run.id,
          userId: data.user?.id,
          brandId: selectedBrand.id,
        });

        const image: GeneratedImage = result.image as GeneratedImage;

        setData((current) => ({
          ...current,
          activeRunId: run.id,
          images: [
            image,
            ...current.images.filter((item) => !(item.runId === run.id && item.angleId === image.angleId)),
          ],
        }));
        setGeneratingImageIds((current) => current.filter((id) => id !== angleId));
        return image;
      }),
    );

    const successCount = results.filter((result) => result.status === "fulfilled").length;
    setGeneratingImageIds([]);
    setData((current) => ({
      ...current,
      activeRunId: run.id,
      runs: current.runs.map((item) =>
        item.id === run.id ? { ...item, stage: successCount === 3 ? "complete" : "article_done" } : item,
      ),
    }));
    void postJson("/api/runs/update", {
      runId: run.id,
      patch: { stage: successCount === 3 ? "complete" : "article_done" },
    }).catch(() => {});

    if (successCount === 3) {
      toast("Images generated and run is ready for approval");
      return;
    }

    const firstError = results.find((result) => result.status === "rejected");
    throw new Error(
      firstError?.status === "rejected" && firstError.reason instanceof Error
        ? firstError.reason.message
        : `${3 - successCount} image${successCount === 2 ? "" : "s"} failed to generate.`,
    );
  }

  async function regenerateImage(angleId: number) {
    if (!draft) {
      return;
    }

    const selectedBrand = data.brands.find((brand) => brand.id === draft.brandId);
    if (!selectedBrand) {
      toast("Brand not found for this run", "error");
      return;
    }
    if (!hasBrandImageInputs(selectedBrand)) {
      toast("Add both a brand logo and style reference before regenerating images.", "error");
      return;
    }

    const feedback = tweakPrompts[angleId]?.trim() || "";
    setGeneratingImageIds((current) => [...current, angleId]);
    try {
      const result = await postJson<{
        image: { angleId: number; angleLabel: string; prompt: string; imageUrl: string };
      }>("/api/generate-image", {
        articleTitle: draft.articleTitle,
        angleId,
        runId: draft.id,
        userId: data.user?.id,
        brandId: selectedBrand.id,
        userFeedback: feedback,
      });

      const nextImage: GeneratedImage = result.image as GeneratedImage;

      setData((current) => ({
        ...current,
        images: [
          nextImage,
          ...current.images.filter((image) => !(image.runId === draft.id && image.angleId === angleId)),
        ],
      }));
      setTweakPrompts((current) => ({ ...current, [angleId]: "" }));
      toast("Image regenerated");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Image regeneration failed", "error");
    } finally {
      setGeneratingImageIds((current) => current.filter((id) => id !== angleId));
    }
  }

  async function sendDraftToN8n() {
    if (!draft) {
      return;
    }

    if (draftImageUrlCount === 0) {
      toast("Generate images before sending to n8n", "error");
      return;
    }

    setIsSendingToN8n(true);
    try {
      await postJson("/api/generated-article-webhook", {
        runId: draft.id,
        userId: data.user?.id,
      });
      toast("Sent to n8n");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not send to n8n", "error");
    } finally {
      setIsSendingToN8n(false);
    }
  }

  async function publishDraftToLinkedIn() {
    if (!draft || !draftBrand) {
      toast("Run or brand not found", "error");
      return;
    }

    const selectedImage = draftImages.find((image) => image.id === draftLinkedInImageId);
    if (!draftBrand.linkedinAccessToken) {
      toast("Connect LinkedIn in Brands first", "error");
      return;
    }
    if (!draftLinkedInOrgId.trim()) {
      toast("Enter the LinkedIn organization ID", "error");
      return;
    }
    if (!selectedImage?.imageUrl) {
      toast("Select a generated image for LinkedIn", "error");
      return;
    }
    if (!draftLinkedInText.trim()) {
      toast("Add LinkedIn post text", "error");
      return;
    }

    setIsPublishingToLinkedIn(true);
    try {
      await postJson<{ postId: string }>("/api/publish-linkedin", {
        accessToken: draftBrand.linkedinAccessToken,
        organizationId: draftLinkedInOrgId,
        commentary: draftLinkedInText,
        imageUrl: selectedImage.imageUrl,
        altText: draft.imageAltText,
      });
      toast("Posted to LinkedIn");
    } catch (error) {
      toast(error instanceof Error ? error.message : "LinkedIn publish failed", "error");
    } finally {
      setIsPublishingToLinkedIn(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-65px)] bg-[#0b1220] px-4 py-10 md:px-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Generate Article</h1>
          <p className="mt-1 text-sm text-slate-400">Create SEO content drafts for Mocko.ai and brand-owned Payload CMS sites.</p>
        </div>

        <div className="rounded-2xl border border-slate-700/60 bg-slate-900 p-6 shadow-sm">
          <div className="mb-5 flex justify-end">
            <button
              type="button"
              onClick={autofillArticleGeneration}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-blue-500 hover:text-white"
            >
              <Icon name="spark" className="h-3.5 w-3.5" />
              Autofill Test Article
            </button>
          </div>
          <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
            <FieldRow label="Brand">
              <select
                value={brandId}
                onChange={(event) => setBrandId(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
              >
                {data.brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </FieldRow>
            <FieldRow label="Article Model">
              <select
                value={articleModelId}
                onChange={(event) => setArticleModelId(event.target.value as ArticleModelId)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
              >
                {ARTICLE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </FieldRow>
            <FieldRow label="Primary Keyword" hint="e.g. pte speaking practice">
              <input
                value={primaryKeyword}
                onChange={(event) => setPrimaryKeyword(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500"
                placeholder="Enter keyword"
              />
            </FieldRow>
          </div>
          <div className="mt-5">
            <FieldRow label="Topic / Task" hint="e.g. PTE Respond to a Situation">
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleGenerate()}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500"
                placeholder="Enter article topic"
              />
            </FieldRow>
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !topic.trim() || !primaryKeyword.trim() || !brandId || !selectedBrandReadyForImages}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Icon name="spark" />}
            {isGenerating ? "Generating" : "Generate Article"}
          </button>
        </div>

        {draft ? (
          <div className="space-y-6 rounded-2xl border border-slate-700/60 bg-slate-900 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white">Article Workspace</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Current status: <span className={stages[draft.stage]?.color}>{stages[draft.stage]?.label ?? draft.stage}</span>
                </p>
              </div>
              {isEdited ? <span className="text-xs font-medium text-amber-400">Saved locally</span> : null}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <FieldRow label="Article Title">
                <input
                  value={draft.articleTitle}
                  onChange={(event) => updateDraft("articleTitle", event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
                />
              </FieldRow>
              <FieldRow label="URL Slug" hint="editable">
                <div className="flex min-w-0 items-center">
                  <span className="shrink-0 rounded-l-lg border border-r-0 border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-400">
                    /blog/
                  </span>
                  <input
                    value={draft.urlSlug}
                    onChange={(event) => {
                      const nextSlug = slugify(event.target.value);
                      updateDraft("urlSlug", nextSlug);
                      updateDraft("canonicalUrl", `https://mocko.ai/blog/${nextSlug}`);
                    }}
                    className="min-w-0 flex-1 rounded-r-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
                  />
                </div>
              </FieldRow>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <FieldRow label="SEO Title" hint="50-60 chars ideal">
                <input
                  value={draft.seoTitle}
                  onChange={(event) => updateDraft("seoTitle", event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
                />
                <CharBar len={draft.seoTitle.length} max={60} />
              </FieldRow>
              <FieldRow label="Canonical URL">
                <input
                  value={draft.canonicalUrl}
                  onChange={(event) => updateDraft("canonicalUrl", event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
                />
              </FieldRow>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <FieldRow label="Meta Description" hint="120-160 chars ideal">
                <textarea
                  value={draft.metaDescription}
                  onChange={(event) => updateDraft("metaDescription", event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
                />
                <CharBar len={draft.metaDescription.length} max={160} />
              </FieldRow>
              <FieldRow label="Image Alt Text">
                <textarea
                  value={draft.imageAltText}
                  onChange={(event) => updateDraft("imageAltText", event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
                />
              </FieldRow>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <FieldRow label="Open Graph Title">
                <input
                  value={draft.ogTitle}
                  onChange={(event) => updateDraft("ogTitle", event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
                />
              </FieldRow>
              <FieldRow label="Open Graph Description">
                <textarea
                  value={draft.ogDescription}
                  onChange={(event) => updateDraft("ogDescription", event.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
                />
              </FieldRow>
            </div>

            <FieldRow label="Article Markdown">
              <textarea
                value={draft.articleMarkdown}
                onChange={(event) => updateDraft("articleMarkdown", event.target.value)}
                rows={10}
                className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm leading-6 text-slate-200 outline-none transition focus:border-blue-500"
              />
            </FieldRow>
            <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Search Preview</p>
              <p className="line-clamp-1 text-[15px] font-medium leading-snug text-blue-300">{draft.seoTitle}</p>
              <p className="break-all text-xs text-emerald-400">https://mocko.ai/blog/{draft.urlSlug}</p>
              <p className="line-clamp-2 text-sm leading-snug text-slate-400">{draft.metaDescription}</p>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Article Images</h3>
                  <p className="mt-1 text-xs text-slate-600">Generate all three angles, then tweak each image independently.</p>
                </div>
                <button
                  onClick={completeRun}
                  disabled={draft.stage === "generating_images"}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {draft.stage === "generating_images" ? "Generating All" : draftImages.length ? "Regenerate All" : "Generate 3 Images"}
                </button>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                {[1, 2, 3].map((angleId) => {
                  const image = draftImages.find((item) => item.angleId === angleId);
                  return (
                    <ImageReviewCard
                      key={angleId}
                      angleId={angleId}
                      image={image}
                      tweakPrompt={tweakPrompts[angleId] ?? image?.userFeedback ?? ""}
                      isGenerating={generatingImageIds.includes(angleId) || draft.stage === "generating_images"}
                      onPromptChange={(value) => setTweakPrompts((current) => ({ ...current, [angleId]: value }))}
                      onRegenerate={() => regenerateImage(angleId)}
                    />
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-950 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">LinkedIn Page</h3>
                  <p className="mt-1 text-xs text-slate-600">Post this draft with one generated image.</p>
                </div>
                <span className={draftBrand?.linkedinAccessToken ? "text-xs text-emerald-400" : "text-xs text-slate-500"}>
                  {draftBrand?.linkedinAccessToken ? "Connected" : "Not connected"}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <FieldRow label="Organization ID">
                  <input
                    value={draftLinkedInOrgId}
                    onChange={(event) => setDraftLinkedInOrgId(event.target.value.replace(/\D/g, ""))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
                    placeholder="123456"
                  />
                </FieldRow>
                <FieldRow label="LinkedIn Text">
                  <textarea
                    value={draftLinkedInText}
                    onChange={(event) => setDraftLinkedInText(event.target.value)}
                    rows={4}
                    className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm leading-6 text-slate-200 outline-none transition focus:border-blue-500"
                  />
                </FieldRow>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {draftImages
                  .filter((image) => image.imageUrl)
                  .map((image) => (
                    <button
                      key={image.id}
                      onClick={() => setDraftLinkedInImageId(image.id)}
                      className={`overflow-hidden rounded-xl border text-left transition ${
                        draftLinkedInImageId === image.id
                          ? "border-blue-400 bg-blue-500/10"
                          : "border-slate-800 bg-slate-900 hover:border-slate-600"
                      }`}
                    >
                      <div className="aspect-video bg-slate-900">
                        <img src={image.imageUrl ?? ""} alt="" className="h-full w-full object-cover" />
                      </div>
                      <div className="px-3 py-2 text-xs font-medium text-slate-300">{image.angleLabel}</div>
                    </button>
                  ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-1 sm:flex-row">
              <button
                onClick={sendDraftToN8n}
                disabled={isSendingToN8n || draftImageUrlCount === 0}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSendingToN8n ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Icon name="upload" />
                )}
                {isSendingToN8n ? "Sending to n8n" : "Add to n8n"}
              </button>
              <button
                onClick={publishDraftToLinkedIn}
                disabled={
                  isPublishingToLinkedIn ||
                  !draftBrand?.linkedinAccessToken ||
                  !draftLinkedInOrgId.trim() ||
                  !draftLinkedInImageId ||
                  !draftLinkedInText.trim()
                }
                className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPublishingToLinkedIn ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Icon name="linkedin" />
                )}
                {isPublishingToLinkedIn ? "Posting to LinkedIn" : "Post to LinkedIn"}
              </button>
              <button
                onClick={() => {
                  setTopic("");
                  setPrimaryKeyword("");
                  setData((current) => ({ ...current, activeRunId: null }));
                }}
                className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800"
              >
                Clear Workspace
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ImageReviewCard({
  angleId,
  image,
  tweakPrompt,
  isGenerating,
  onPromptChange,
  onRegenerate,
}: {
  angleId: number;
  image?: GeneratedImage;
  tweakPrompt: string;
  isGenerating: boolean;
  onPromptChange: (value: string) => void;
  onRegenerate: () => void;
}) {
  const label = image?.angleLabel ?? ["Overview", "Action", "Outcome"][angleId - 1] ?? `Angle ${angleId}`;

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-950 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-white">{label}</h4>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-500">#{angleId}</span>
      </div>
      <div className="aspect-video overflow-hidden rounded-lg bg-slate-900">
        {image?.imageUrl ? (
          <img src={image.imageUrl} alt={image.prompt} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-slate-600">
            {isGenerating ? "Generating image" : "No image yet"}
          </div>
        )}
      </div>
      {image?.prompt ? <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{image.prompt}</p> : null}
      <textarea
        value={tweakPrompt}
        onChange={(event) => onPromptChange(event.target.value)}
        rows={3}
        placeholder="Tweak this image, e.g. warmer lighting, more professional office, no laptop"
        className="mt-3 w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs leading-5 text-white outline-none transition placeholder:text-slate-600 focus:border-blue-500"
      />
      <button
        onClick={onRegenerate}
        disabled={isGenerating}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerating ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-transparent" /> : null}
        {image ? "Regenerate Image" : "Generate Image"}
      </button>
    </div>
  );
}

function BrandsPage({
  data,
  setData,
}: {
  data: StudioData;
  setData: React.Dispatch<React.SetStateAction<StudioData>>;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Brand | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const canAddMore = data.brands.length < 3;

  function deleteBrand(id: string) {
    const brandRuns = data.runs.filter((run) => run.brandId === id);
    if (brandRuns.length > 0 && !window.confirm("Delete this brand and its local content runs?")) {
      return;
    }

    void postJson("/api/brands/delete", { userId: data.user?.id, brandId: id }).catch((error) => {
      toast(error instanceof Error ? error.message : "Could not delete brand from DB", "error");
    });
    setData((current) => ({
      ...current,
      brands: current.brands.filter((brand) => brand.id !== id),
      runs: current.runs.filter((run) => run.brandId !== id),
      images: current.images.filter((image) => !brandRuns.some((run) => run.id === image.runId)),
    }));
    toast("Brand deleted");
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Brands</h1>
          <p className="mt-1 text-sm text-slate-400">Manage up to 3 brands with their own assets and CMS</p>
        </div>
        {canAddMore ? (
          <button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            <Icon name="plus" /> New Brand
          </button>
        ) : null}
      </div>

      {data.brands.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
            <Icon name="plus" className="h-6 w-6" />
          </div>
          <h3 className="mb-1 font-semibold text-white">No brands yet</h3>
          <p className="mb-5 text-sm text-slate-500">Create your first brand to start generating content</p>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Create Brand
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {data.brands.map((brand) => (
            <BrandCard
              key={brand.id}
              brand={brand}
              userId={data.user?.id ?? ""}
              onEdit={(nextBrand) => {
                setEditing(nextBrand);
                setModalOpen(true);
              }}
              onDelete={deleteBrand}
            />
          ))}
          {!canAddMore ? <p className="py-2 text-center text-sm text-slate-600">Maximum 3 brands reached</p> : null}
        </div>
      )}

      {modalOpen ? (
        <BrandModal
          brand={editing}
          onClose={() => setModalOpen(false)}
          onSave={async (brand) => {
            const result = await postJson<{ brand: Brand }>("/api/brands", {
              userId: data.user?.id,
              brand,
            });
            setData((current) => ({
              ...current,
              brands: current.brands.some((item) => item.id === result.brand.id)
                ? current.brands.map((item) => (item.id === result.brand.id ? result.brand : item))
                : [result.brand, ...current.brands],
            }));
            setModalOpen(false);
            toast(editing ? "Brand updated" : "Brand created");
          }}
        />
      ) : null}
    </div>
  );
}

function BrandCard({
  brand,
  userId,
  onEdit,
  onDelete,
}: {
  brand: Brand;
  userId: string;
  onEdit: (brand: Brand) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900 p-5 transition hover:border-slate-600">
      <div className="mb-4 flex items-center gap-4">
        {brand.logoUrl ? (
          <img src={brand.logoUrl} alt="" className="h-12 w-12 rounded-xl bg-slate-800 object-contain p-1" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-300">
            <Icon name="spark" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-white">{brand.name}</h3>
          <p className="truncate text-xs text-slate-500">
            {brand.cmsUrl ? `CMS: ${brand.cmsUrl.replace(/https?:\/\//, "")}` : "No CMS configured"}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <a
            href={`/api/linkedin/oauth/start?brandId=${encodeURIComponent(brand.id)}&userId=${encodeURIComponent(userId)}`}
            className={`rounded-lg border p-2 transition ${
              brand.linkedinAccessToken
                ? "border-emerald-700/50 bg-emerald-900/25 text-emerald-300 hover:bg-emerald-900/40"
                : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
            title={brand.linkedinAccessToken ? "Reconnect LinkedIn" : "Connect LinkedIn"}
          >
            <Icon name="linkedin" />
          </a>
          <button
            onClick={() => onEdit(brand)}
            className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 transition hover:bg-slate-700"
            title="Edit brand"
          >
            <Icon name="edit" />
          </button>
          <button
            onClick={() => onDelete(brand.id)}
            className="rounded-lg border border-red-800/40 bg-red-900/30 p-2 text-red-400 transition hover:bg-red-900/50"
            title="Delete brand"
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
        <StatusLine active={!!brand.logoUrl} label={`Logo ${brand.logoUrl ? "uploaded" : "missing"}`} />
        <StatusLine active={!!brand.styleImageUrl} label={`Style ref ${brand.styleImageUrl ? "uploaded" : "missing"}`} />
        <StatusLine active={!!brand.masterPrompt} label={`Master prompt ${brand.masterPrompt ? "set" : "empty"}`} />
        <StatusLine active={!!brand.cmsUrl} label={`CMS ${brand.cmsUrl ? "configured" : "not set"}`} />
        <StatusLine active={!!brand.linkedinAccessToken} label={`LinkedIn ${brand.linkedinAccessToken ? "connected" : "not connected"}`} />
      </div>
    </div>
  );
}

function StatusLine({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={active ? "text-emerald-400" : "text-slate-600"}>●</span>
      {label}
    </div>
  );
}

function hasBrandImageInputs(brand: Pick<Brand, "logoUrl" | "styleImageUrl">) {
  return Boolean(brand.logoUrl && brand.styleImageUrl);
}

function BrandModal({
  brand,
  onClose,
  onSave,
}: {
  brand: Brand | null;
  onClose: () => void;
  onSave: (brand: Brand) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const logoRef = useRef<HTMLInputElement>(null);
  const styleRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: brand?.name ?? "",
    masterPrompt: brand?.masterPrompt ?? "",
    cmsUrl: brand?.cmsUrl ?? "",
    cmsEmail: brand?.cmsEmail ?? "",
    cmsPassword: brand?.cmsPassword ?? "",
    cmsCollectionSlug: brand?.cmsCollectionSlug ?? "posts",
    linkedinOrganizationId: brand?.linkedinOrganizationId ?? "",
    linkedinAccessToken: brand?.linkedinAccessToken ?? null,
    linkedinAccessTokenExpiresAt: brand?.linkedinAccessTokenExpiresAt ?? null,
    logoUrl: brand?.logoUrl ?? null,
    styleImageUrl: brand?.styleImageUrl ?? null,
  });

  function previewFile(file: File, key: "logoUrl" | "styleImageUrl") {
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, [key]: reader.result as string }));
    reader.readAsDataURL(file);
  }

  async function saveBrand() {
    if (!form.name.trim()) {
      toast("Brand name is required", "error");
      return;
    }
    if (!form.logoUrl || !form.styleImageUrl) {
      toast("Brand logo and style reference are required", "error");
      return;
    }

    const timestamp = new Date().toISOString();
    try {
      await onSave({
        id: brand?.id ?? makeId("brand"),
        name: form.name.trim(),
        masterPrompt: form.masterPrompt,
        cmsUrl: form.cmsUrl || null,
        cmsEmail: form.cmsEmail || null,
        cmsPassword: form.cmsPassword || null,
        cmsCollectionSlug: form.cmsCollectionSlug || "posts",
        linkedinOrganizationId: form.linkedinOrganizationId || null,
        linkedinAccessToken: form.linkedinAccessToken,
        linkedinAccessTokenExpiresAt: form.linkedinAccessTokenExpiresAt,
        logoUrl: form.logoUrl,
        styleImageUrl: form.styleImageUrl,
        createdAt: brand?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save brand", "error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700/50 bg-[#0f1729] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-700/50 bg-[#0f1729] p-6">
          <h2 className="text-lg font-bold text-white">{brand ? "Edit Brand" : "Create New Brand"}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 transition hover:bg-slate-700 hover:text-white"
            title="Close"
          >
            <Icon name="x" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <FieldRow label="Brand Name">
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500"
              placeholder="e.g. Mocko.ai"
            />
          </FieldRow>

          <div className="grid gap-4 sm:grid-cols-2">
            <UploadBox
              label="Brand Logo"
              preview={form.logoUrl}
              fit="contain"
              onClick={() => logoRef.current?.click()}
            />
            <UploadBox
              label="Style Reference Image"
              preview={form.styleImageUrl}
              fit="cover"
              onClick={() => styleRef.current?.click()}
            />
            <input
              ref={logoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) previewFile(file, "logoUrl");
              }}
            />
            <input
              ref={styleRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) previewFile(file, "styleImageUrl");
              }}
            />
          </div>

          <FieldRow label="Master Prompt" hint="sent as the system prompt">
            <textarea
              value={form.masterPrompt}
              onChange={(event) => setForm((current) => ({ ...current, masterPrompt: event.target.value }))}
              rows={5}
              className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-blue-500"
              placeholder="Write comprehensive, engaging articles that match this brand voice..."
            />
          </FieldRow>

          <div className="space-y-4 rounded-xl border border-slate-700/50 p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Payload CMS Settings</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">optional</span>
            </div>
            <FieldRow label="CMS URL">
              <input
                value={form.cmsUrl}
                onChange={(event) => setForm((current) => ({ ...current, cmsUrl: event.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
                placeholder="https://your-payload-cms.com"
              />
            </FieldRow>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label="CMS Email">
                <input
                  value={form.cmsEmail}
                  onChange={(event) => setForm((current) => ({ ...current, cmsEmail: event.target.value }))}
                  type="email"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
                  placeholder="admin@example.com"
                />
              </FieldRow>
              <FieldRow label="CMS Password">
                <input
                  value={form.cmsPassword}
                  onChange={(event) => setForm((current) => ({ ...current, cmsPassword: event.target.value }))}
                  type="password"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
                  placeholder="••••••••"
                />
              </FieldRow>
            </div>
            <FieldRow label="Collection Slug">
              <input
                value={form.cmsCollectionSlug}
                onChange={(event) => setForm((current) => ({ ...current, cmsCollectionSlug: event.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
                placeholder="posts"
              />
            </FieldRow>
          </div>

          <div className="space-y-4 rounded-xl border border-slate-700/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">LinkedIn Settings</span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">optional</span>
              </div>
              {form.linkedinAccessToken ? <span className="text-xs font-medium text-emerald-400">OAuth connected</span> : null}
            </div>
            <FieldRow label="Organization ID" hint="numeric LinkedIn company page ID">
              <input
                value={form.linkedinOrganizationId}
                onChange={(event) => setForm((current) => ({ ...current, linkedinOrganizationId: event.target.value.replace(/\D/g, "") }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500"
                placeholder="123456"
              />
            </FieldRow>
            <p className="text-xs leading-5 text-slate-500">
              Save this brand, then use the brand card to connect LinkedIn OAuth for posting to the organization page.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={saveBrand}
              className="flex-1 rounded-xl bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-500"
            >
              {brand ? "Save Changes" : "Create Brand"}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl bg-slate-800 px-6 py-3 font-medium text-slate-300 transition hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadBox({
  label,
  preview,
  fit,
  onClick,
}: {
  label: string;
  preview: string | null;
  fit: "cover" | "contain";
  onClick: () => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</label>
      <button
        type="button"
        onClick={onClick}
        className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-700 bg-slate-900 transition hover:border-blue-500"
      >
        {preview ? (
          <img src={preview} alt="" className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain p-2"}`} />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <Icon name="upload" className="h-6 w-6" />
            <span className="text-xs">Click to upload</span>
          </div>
        )}
      </button>
    </div>
  );
}

function HistoryPage({
  data,
  setData,
}: {
  data: StudioData;
  setData: React.Dispatch<React.SetStateAction<StudioData>>;
}) {
  const { toast } = useToast();
  const [filterBrand, setFilterBrand] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [sendingN8nRunId, setSendingN8nRunId] = useState<string | null>(null);
  const [publishingLinkedInRunId, setPublishingLinkedInRunId] = useState<string | null>(null);
  const [linkedinText, setLinkedinText] = useState("");
  const [linkedinImageId, setLinkedinImageId] = useState("");
  const selectedRun = data.runs.find((run) => run.id === selectedRunId) ?? null;
  const selectedBrand = selectedRun ? data.brands.find((brand) => brand.id === selectedRun.brandId) ?? null : null;
  const selectedImages = selectedRun ? data.images.filter((image) => image.runId === selectedRun.id) : [];
  const runs = useMemo(
    () => data.runs.filter((run) => !filterBrand || run.brandId === filterBrand),
    [data.runs, filterBrand],
  );

  useEffect(() => {
    if (!selectedRun) {
      setLinkedinText("");
      setLinkedinImageId("");
      return;
    }

    const firstImage = selectedImages
      .sort((a, b) => a.angleId - b.angleId)
      .find((image) => image.imageUrl);
    setLinkedinText(defaultLinkedInText(selectedRun));
    setLinkedinImageId(firstImage?.id ?? "");
  }, [selectedRunId]);

  function approveRun(runId: string) {
    setData((current) => ({
      ...current,
      runs: current.runs.map((run) => (run.id === runId ? { ...run, approved: true, stage: "approved" } : run)),
    }));
    toast("Run approved");
  }

  async function publishRun(runId: string) {
    const run = data.runs.find((item) => item.id === runId);
    const brand = run ? data.brands.find((item) => item.id === run.brandId) : null;
    if (!run || !brand) {
      toast("Run or brand not found", "error");
      return;
    }

    if (!brand.cmsUrl || !brand.cmsEmail || !brand.cmsPassword) {
      toast("Configure CMS credentials in Brands before publishing", "error");
      return;
    }

    try {
      await postJson<{ cmsPostId: string }>("/api/publish-cms", {
        cmsUrl: brand.cmsUrl,
        cmsEmail: brand.cmsEmail,
        cmsPassword: brand.cmsPassword,
        collectionSlug: brand.cmsCollectionSlug || "posts",
        article: {
          title: run.seoTitle || run.articleTitle,
          content: run.articleMarkdown,
          metaDescription: run.metaDescription,
          keyword: run.primaryKeyword,
        },
        imageUrls: data.images
          .filter((image) => image.runId === runId)
          .sort((a, b) => a.angleId - b.angleId)
          .map((image) => image.imageUrl)
          .filter(Boolean),
      });

      setData((current) => ({
        ...current,
        runs: current.runs.map((item) => (item.id === runId ? { ...item, stage: "published" } : item)),
      }));
      toast("Published to Payload CMS");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Publish failed", "error");
    }
  }

  async function sendRunToN8n(runId: string) {
    const imageUrlCount = data.images.filter((image) => image.runId === runId && image.imageUrl).length;
    if (imageUrlCount === 0) {
      toast("Generate images before sending to n8n", "error");
      return;
    }

    setSendingN8nRunId(runId);
    try {
      await postJson("/api/generated-article-webhook", {
        runId,
        userId: data.user?.id,
      });
      toast("Sent to n8n");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not send to n8n", "error");
    } finally {
      setSendingN8nRunId(null);
    }
  }

  async function publishRunToLinkedIn(runId: string) {
    const run = data.runs.find((item) => item.id === runId);
    const brand = run ? data.brands.find((item) => item.id === run.brandId) : null;
    const image = data.images.find((item) => item.id === linkedinImageId);

    if (!run || !brand) {
      toast("Run or brand not found", "error");
      return;
    }
    if (!brand.linkedinOrganizationId || !brand.linkedinAccessToken) {
      toast("Connect LinkedIn and add the organization ID in Brands first", "error");
      return;
    }
    if (!image?.imageUrl) {
      toast("Select an image for LinkedIn", "error");
      return;
    }
    if (!linkedinText.trim()) {
      toast("Add LinkedIn post text", "error");
      return;
    }

    setPublishingLinkedInRunId(runId);
    try {
      await postJson<{ postId: string }>("/api/publish-linkedin", {
        accessToken: brand.linkedinAccessToken,
        organizationId: brand.linkedinOrganizationId,
        commentary: linkedinText,
        imageUrl: image.imageUrl,
        altText: run.imageAltText,
      });
      toast("Posted to LinkedIn");
    } catch (error) {
      toast(error instanceof Error ? error.message : "LinkedIn publish failed", "error");
    } finally {
      setPublishingLinkedInRunId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">History</h1>
          <p className="mt-1 text-sm text-slate-400">All your past content runs</p>
        </div>
        <select
          value={filterBrand}
          onChange={(event) => setFilterBrand(event.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500"
        >
          <option value="">All brands</option>
          {data.brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-slate-500">
            <Icon name="spark" className="h-6 w-6" />
          </div>
          <h3 className="mb-1 font-semibold text-white">No runs yet</h3>
          <p className="text-sm text-slate-500">Your generated content will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => {
            const stage = stages[run.stage] ?? { label: run.stage, color: "text-slate-400" };
            return (
              <button
                key={run.id}
                onClick={() => setSelectedRunId(run.id)}
                className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-700/50 bg-slate-900 px-5 py-4 text-left transition hover:border-slate-600"
              >
                <div className="min-w-0">
                  <h3 className="mb-1 truncate text-sm font-semibold text-white">{run.articleTitle || run.topic}</h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{run.primaryKeyword}</span>
                    <span>•</span>
                    <span>{formatDate(run.createdAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`text-xs font-medium ${stage.color}`}>{stage.label}</span>
                  <Icon name="chevron" className="h-4 w-4 text-slate-600" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedRun ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700/50 bg-[#0f1729] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-700/50 bg-[#0f1729] p-6">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-white">{selectedRun.articleTitle}</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selectedBrand?.name ?? "Unknown brand"} • {selectedRun.primaryKeyword}
                </p>
              </div>
              <button
                onClick={() => setSelectedRunId(null)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-400 transition hover:bg-slate-700 hover:text-white"
                title="Close"
              >
                <Icon name="x" />
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Article</h3>
                <div className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 font-mono text-sm leading-relaxed text-slate-400">
                  {selectedRun.articleMarkdown}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Images</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {selectedImages
                    .sort((a, b) => a.angleId - b.angleId)
                    .map((image) => (
                      <div key={image.id} className="aspect-video overflow-hidden rounded-xl bg-slate-950">
                        {image.imageUrl ? (
                          <img src={image.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-slate-600">
                            {image.angleLabel}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">LinkedIn Post</h3>
                  <span className={selectedBrand?.linkedinAccessToken ? "text-xs text-emerald-400" : "text-xs text-slate-500"}>
                    {selectedBrand?.linkedinAccessToken ? "Connected" : "Not connected"}
                  </span>
                </div>
                <textarea
                  value={linkedinText}
                  onChange={(event) => setLinkedinText(event.target.value)}
                  rows={5}
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm leading-6 text-slate-200 outline-none transition focus:border-blue-500"
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  {selectedImages
                    .filter((image) => image.imageUrl)
                    .sort((a, b) => a.angleId - b.angleId)
                    .map((image) => (
                      <button
                        key={image.id}
                        onClick={() => setLinkedinImageId(image.id)}
                        className={`overflow-hidden rounded-xl border text-left transition ${
                          linkedinImageId === image.id
                            ? "border-blue-400 bg-blue-500/10"
                            : "border-slate-800 bg-slate-900 hover:border-slate-600"
                        }`}
                      >
                        <div className="aspect-video bg-slate-900">
                          <img src={image.imageUrl ?? ""} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div className="px-3 py-2 text-xs font-medium text-slate-300">{image.angleLabel}</div>
                      </button>
                    ))}
                </div>
                <button
                  onClick={() => publishRunToLinkedIn(selectedRun.id)}
                  disabled={
                    publishingLinkedInRunId === selectedRun.id ||
                    !selectedBrand?.linkedinAccessToken ||
                    !selectedBrand?.linkedinOrganizationId ||
                    !linkedinImageId ||
                    !linkedinText.trim()
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {publishingLinkedInRunId === selectedRun.id ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <Icon name="linkedin" />
                  )}
                  {publishingLinkedInRunId === selectedRun.id ? "Posting to LinkedIn" : "Post to LinkedIn"}
                </button>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => sendRunToN8n(selectedRun.id)}
                  disabled={sendingN8nRunId === selectedRun.id || selectedImages.every((image) => !image.imageUrl)}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sendingN8nRunId === selectedRun.id ? "Sending to n8n" : "Add to n8n"}
                </button>
                <button
                  onClick={() => approveRun(selectedRun.id)}
                  disabled={selectedRun.stage === "published"}
                  className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => publishRun(selectedRun.id)}
                  disabled={!selectedRun.approved}
                  className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Publish to CMS
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultLinkedInText(run: ContentRun) {
  const description = run.metaDescription || run.ogDescription;
  return [run.articleTitle, description, run.canonicalUrl].filter(Boolean).join("\n\n");
}

async function postJson<T>(url: string, payload: unknown, timeoutMs = 240000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out. Try regenerating.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  const data = (await response.json().catch(() => ({ error: "Request failed without JSON response." }))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

export default function Home() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
