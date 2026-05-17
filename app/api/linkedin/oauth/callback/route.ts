import { NextResponse } from "next/server";
import { exchangeLinkedInCode, getLinkedInConfig, parseLinkedInState } from "@/lib/linkedin";
import { updateBrandLinkedInOAuth } from "@/lib/studio-db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = new URL("/", url.origin);

  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");

    if (oauthError) {
      returnTo.searchParams.set("linkedin", "error");
      returnTo.searchParams.set("message", oauthError);
      return NextResponse.redirect(returnTo);
    }

    if (!code || !state) {
      throw new Error("LinkedIn OAuth callback is missing code or state.");
    }

    const config = getLinkedInConfig(url.origin);
    const parsedState = parseLinkedInState(state, config.stateSecret);
    const token = await exchangeLinkedInCode({ code, origin: url.origin });

    await updateBrandLinkedInOAuth({
      userId: parsedState.userId,
      brandId: parsedState.brandId,
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
      personUrn: token.personUrn,
    });

    return NextResponse.redirect(parsedState.returnTo || returnTo);
  } catch (error) {
    returnTo.searchParams.set("linkedin", "error");
    returnTo.searchParams.set(
      "message",
      error instanceof Error ? error.message : "Could not complete LinkedIn OAuth.",
    );
    return NextResponse.redirect(returnTo);
  }
}
