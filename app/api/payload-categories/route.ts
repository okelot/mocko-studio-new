import { NextResponse } from "next/server";
import { listPayloadCategories } from "@/lib/content";

export async function GET() {
  try {
    const cmsUrl = process.env.MOCKO_PAYLOAD_CMS_URL || "";
    const cmsEmail = process.env.MOCKO_PAYLOAD_CMS_EMAIL || "";
    const cmsPassword = process.env.MOCKO_PAYLOAD_CMS_PASSWORD || "";

    if (!cmsUrl || !cmsEmail || !cmsPassword) {
      return NextResponse.json({ error: "Payload CMS credentials are not configured." }, { status: 400 });
    }

    const categories = await listPayloadCategories({ cmsUrl, cmsEmail, cmsPassword });
    return NextResponse.json({ categories });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load Payload categories." },
      { status: 500 },
    );
  }
}
