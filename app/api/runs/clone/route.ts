import { NextResponse } from "next/server";
import { cloneRunInDb, ensurePublicUser } from "@/lib/studio-db";
import type { ContentRun, User } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      user?: User;
      userId?: string;
      run?: ContentRun;
    };

    if (!body.run) {
      return NextResponse.json({ error: "Run data is required." }, { status: 400 });
    }

    let userId = body.userId ?? "";
    if (body.user) {
      const dbUser = await ensurePublicUser(body.user);
      userId = dbUser.id;
    }

    if (!userId) {
      return NextResponse.json({ error: "User is required." }, { status: 400 });
    }

    const run = await cloneRunInDb({ userId, run: body.run });
    return NextResponse.json({ run });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not clone run." },
      { status: 500 },
    );
  }
}
