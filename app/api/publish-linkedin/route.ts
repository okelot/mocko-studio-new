import { NextResponse } from "next/server";
import { publishLinkedInImagePost } from "@/lib/linkedin";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      accessToken?: string;
      organizationId?: string;
      commentary?: string;
      imageUrl?: string;
      altText?: string;
    };

    if (!body.accessToken || !body.organizationId) {
      return NextResponse.json({ error: "LinkedIn connection is not configured for this brand." }, { status: 400 });
    }
    if (!body.commentary?.trim()) {
      return NextResponse.json({ error: "LinkedIn post text is required." }, { status: 400 });
    }
    if (!body.imageUrl) {
      return NextResponse.json({ error: "Select an image before posting to LinkedIn." }, { status: 400 });
    }

    const postId = await publishLinkedInImagePost({
      accessToken: body.accessToken,
      organizationId: body.organizationId,
      commentary: body.commentary.trim(),
      imageUrl: body.imageUrl,
      altText: body.altText,
    });

    return NextResponse.json({ postId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish to LinkedIn." },
      { status: 500 },
    );
  }
}
