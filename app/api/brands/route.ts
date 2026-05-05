import { NextResponse } from "next/server";
import { upsertBrand } from "@/lib/studio-db";
import type { Brand } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { userId?: string; brand?: Brand };
    if (!body.userId || !body.brand) {
      return NextResponse.json({ error: "User and brand are required." }, { status: 400 });
    }

    const brand = await upsertBrand(body.userId, body.brand);
    return NextResponse.json({ brand });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save brand." },
      { status: 500 },
    );
  }
}
