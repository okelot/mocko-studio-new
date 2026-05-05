import { NextResponse } from "next/server";
import { loadStudioDataFromDb } from "@/lib/studio-db";
import type { User } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { user?: User };
    if (!body.user?.id || !body.user.email) {
      return NextResponse.json({ error: "User is required." }, { status: 400 });
    }

    const data = await loadStudioDataFromDb(body.user);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load studio data." },
      { status: 500 },
    );
  }
}
