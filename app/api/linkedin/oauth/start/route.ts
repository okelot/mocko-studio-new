import { NextResponse } from "next/server";
import { createLinkedInAuthorizationUrl } from "@/lib/linkedin";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const brandId = url.searchParams.get("brandId");
    const userId = url.searchParams.get("userId");

    if (!brandId || !userId) {
      return NextResponse.json({ error: "Brand and user are required." }, { status: 400 });
    }

    return NextResponse.redirect(
      createLinkedInAuthorizationUrl({
        origin: url.origin,
        brandId,
        userId,
        returnTo: `${url.origin}/?linkedin=connected`,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start LinkedIn OAuth." },
      { status: 500 },
    );
  }
}
