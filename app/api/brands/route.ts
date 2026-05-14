import { NextResponse } from "next/server";
import { upsertBrand, ensurePublicUser } from "@/lib/studio-db";
import type { Brand, User } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { userId?: string; user?: User; brand?: Brand };
    if (!body.userId || !body.brand) {
      return NextResponse.json({ error: "User and brand are required." }, { status: 400 });
    }

    // Ensure the user exists in the public users table before creating a brand.
    // Use the DB user's id (ensurePublicUser may return a different id if the user
    // was previously stored under a different auth UUID but the same email).
    let effectiveUserId = body.userId;
    if (body.user) {
      const dbUser = await ensurePublicUser(body.user);
      effectiveUserId = dbUser.id;
    }

    const brand = await upsertBrand(effectiveUserId, body.brand);
    return NextResponse.json({ brand });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save brand." },
      { status: 500 },
    );
  }
}
