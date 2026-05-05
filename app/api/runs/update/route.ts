import { NextResponse } from "next/server";
import { updateRunInDb } from "@/lib/studio-db";
import type { ContentRun } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { runId?: string; patch?: Partial<ContentRun> };
    if (!body.runId || !body.patch) {
      return NextResponse.json({ error: "Run id and patch are required." }, { status: 400 });
    }

    const run = await updateRunInDb(body.runId, body.patch);
    return NextResponse.json({ run });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update run." },
      { status: 500 },
    );
  }
}
