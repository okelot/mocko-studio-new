import { NextResponse } from "next/server";
import { deleteBrandFromDb } from "@/lib/studio-db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { userId?: string; brandId?: string };
    if (!body.userId || !body.brandId) {
      return NextResponse.json({ error: "User and brand id are required." }, { status: 400 });
    }

    await deleteBrandFromDb(body.userId, body.brandId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete brand." },
      { status: 500 },
    );
  }
}
