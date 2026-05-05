import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ensurePublicUser } from "@/lib/studio-db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error || !data.user) {
      return NextResponse.json({ error: error?.message || "Invalid email or password." }, { status: 401 });
    }

    const authUser = {
        id: data.user.id,
        email: data.user.email || body.email,
        name:
          (data.user.user_metadata?.full_name as string | undefined) ||
          (data.user.user_metadata?.name as string | undefined) ||
          data.user.email?.split("@")[0] ||
          "Mocko user",
        avatarUrl: (data.user.user_metadata?.avatar_url as string | undefined) || null,
        role: "user",
    };

    const user = await ensurePublicUser(authUser);
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sign in." },
      { status: 500 },
    );
  }
}
