import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { ensurePublicUser } from "@/lib/studio-db";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    if (body.password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });

    if (error || !data.user) {
      return NextResponse.json({ error: error?.message || "Failed to create user." }, { status: 400 });
    }

    const authUser = {
        id: data.user.id,
        email: data.user.email || body.email,
        name: data.user.email?.split("@")[0] || "Mocko user",
        avatarUrl: null,
        role: "user",
    };

    const user = await ensurePublicUser(authUser);
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sign up." },
      { status: 500 },
    );
  }
}
