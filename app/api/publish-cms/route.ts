import { NextResponse } from "next/server";
import { publishToPayloadCMS } from "@/lib/content";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<Parameters<typeof publishToPayloadCMS>[0]>;
    const payload = {
      ...body,
      cmsUrl: body.cmsUrl || process.env.MOCKO_PAYLOAD_CMS_URL || "",
      cmsEmail: body.cmsEmail || process.env.MOCKO_PAYLOAD_CMS_EMAIL || "",
      cmsPassword: body.cmsPassword || process.env.MOCKO_PAYLOAD_CMS_PASSWORD || "",
      collectionSlug: body.collectionSlug || process.env.MOCKO_PAYLOAD_CMS_COLLECTION_SLUG || "posts",
      mainCategoryId: body.mainCategoryId || process.env.MOCKO_PAYLOAD_CMS_MAIN_CATEGORY_ID || "",
    } as Parameters<typeof publishToPayloadCMS>[0];

    if (!payload.cmsUrl || !payload.cmsEmail || !payload.cmsPassword) {
      return NextResponse.json({ error: "Payload CMS credentials are not configured." }, { status: 400 });
    }

    const cmsPostId = await publishToPayloadCMS(payload);
    return NextResponse.json({ cmsPostId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish to Payload CMS." },
      { status: 500 },
    );
  }
}
