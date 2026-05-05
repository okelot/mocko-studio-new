import { NextResponse } from "next/server";
import { publishToPayloadCMS } from "@/lib/content";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Parameters<typeof publishToPayloadCMS>[0];

    if (!body.cmsUrl || !body.cmsEmail || !body.cmsPassword) {
      return NextResponse.json({ error: "CMS credentials are not configured for this brand." }, { status: 400 });
    }

    const cmsPostId = await publishToPayloadCMS(body);
    return NextResponse.json({ cmsPostId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish to Payload CMS." },
      { status: 500 },
    );
  }
}
