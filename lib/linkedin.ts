import crypto from "node:crypto";

const LINKEDIN_API = "https://api.linkedin.com/rest";
const LINKEDIN_AUTH = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN = "https://www.linkedin.com/oauth/v2/accessToken";

export class LinkedInConfigError extends Error {
  status = 400;
}

export interface LinkedInOAuthState {
  brandId: string;
  userId: string;
  returnTo: string;
}

export function getLinkedInConfig(origin?: string) {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri =
    process.env.LINKEDIN_REDIRECT_URI || (origin ? `${origin}/api/linkedin/oauth/callback` : null);
  const stateSecret = process.env.LINKEDIN_OAUTH_STATE_SECRET || clientSecret;
  const version = process.env.LINKEDIN_VERSION || "202604";

  if (!clientId || !clientSecret || !stateSecret || (origin !== undefined && !redirectUri)) {
    throw new LinkedInConfigError(
      "LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are required before connecting LinkedIn.",
    );
  }

  return { clientId, clientSecret, redirectUri: redirectUri ?? "", stateSecret, version };
}

export function createLinkedInState(payload: LinkedInOAuthState, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function parseLinkedInState(state: string, secret: string): LinkedInOAuthState {
  const [body, signature] = state.split(".");
  if (!body || !signature) {
    throw new Error("Invalid LinkedIn OAuth state.");
  }

  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Invalid LinkedIn OAuth signature.");
  }

  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as LinkedInOAuthState;
}

export function createLinkedInAuthorizationUrl(params: {
  origin: string;
  brandId: string;
  userId: string;
  returnTo: string;
}) {
  const config = getLinkedInConfig(params.origin);
  const state = createLinkedInState(
    { brandId: params.brandId, userId: params.userId, returnTo: params.returnTo },
    config.stateSecret,
  );
  const url = new URL(LINKEDIN_AUTH);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set(
    "scope",
    process.env.LINKEDIN_SCOPES || "w_member_social w_organization_social",
  );
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeLinkedInCode(params: {
  code: string;
  origin: string;
}) {
  const config = getLinkedInConfig(params.origin);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(LINKEDIN_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  } | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error_description || payload?.error || "LinkedIn token exchange failed.");
  }

  const accessToken = payload.access_token;
  const expiresAt = payload.expires_in
    ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
    : null;

  // Fetch the LinkedIn member's person URN via the userInfo endpoint
  let personUrn: string | null = null;
  try {
    const userInfoRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userInfo = (await userInfoRes.json().catch(() => null)) as { sub?: string; error?: string } | null;
    console.log("[LinkedIn] userinfo status:", userInfoRes.status, "body:", JSON.stringify(userInfo));
    if (userInfoRes.ok && userInfo?.sub) {
      personUrn = `urn:li:person:${userInfo.sub}`;
    }
  } catch (err) {
    console.log("[LinkedIn] userinfo fetch error:", err);
    // Non-fatal — personUrn stays null
  }
  console.log("[LinkedIn] personUrn resolved:", personUrn);

  return { accessToken, expiresAt, personUrn };
}

export async function publishLinkedInImagePost(params: {
  accessToken: string;
  organizationId: string;
  personUrn: string | null;
  commentary: string;
  imageUrl: string;
  altText?: string;
}) {
  const config = getLinkedInConfig();
  // Use person URN if available (w_member_social scope), otherwise try org URN (requires w_organization_social)
  const author = params.personUrn ?? `urn:li:organization:${params.organizationId}`;
  const headers = {
    Authorization: `Bearer ${params.accessToken}`,
    "Content-Type": "application/json",
    "Linkedin-Version": config.version,
    "X-Restli-Protocol-Version": "2.0.0",
  };

  const initializeResponse = await fetch(`${LINKEDIN_API}/images?action=initializeUpload`, {
    method: "POST",
    headers,
    body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
  });
  const initialized = (await initializeResponse.json().catch(() => null)) as {
    value?: { uploadUrl?: string; image?: string };
    message?: string;
  } | null;

  if (!initializeResponse.ok || !initialized?.value?.uploadUrl || !initialized.value.image) {
    throw new Error(initialized?.message || "Could not initialize LinkedIn image upload.");
  }

  const imageResponse = await fetch(params.imageUrl);
  if (!imageResponse.ok) {
    throw new Error("Could not fetch selected image for LinkedIn upload.");
  }
  const imageContentType = imageResponse.headers.get("content-type") || "image/png";
  const imageBuffer = await imageResponse.arrayBuffer();

  const uploadResponse = await fetch(initialized.value.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": imageContentType },
    body: imageBuffer,
  });

  if (!uploadResponse.ok) {
    throw new Error(`LinkedIn image upload failed: ${uploadResponse.statusText}`);
  }

  const postResponse = await fetch(`${LINKEDIN_API}/posts`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      author,
      commentary: params.commentary,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: {
          altText: params.altText || "",
          id: initialized.value.image,
        },
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  if (!postResponse.ok) {
    const errorText = await postResponse.text();
    throw new Error(errorText || `LinkedIn post failed: ${postResponse.statusText}`);
  }

  return postResponse.headers.get("x-restli-id") || "";
}
