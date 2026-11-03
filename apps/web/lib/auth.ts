import type { AuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";

type KeycloakProfile = {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  picture?: string;
  realm_access?: { roles?: string[] };
};

function keycloakPublicIssuer() {
  return process.env.KEYCLOAK_PUBLIC_ISSUER ?? process.env.KEYCLOAK_ISSUER ?? "http://localhost:8080/realms/planner";
}

function keycloakInternalIssuer() {
  return process.env.KEYCLOAK_INTERNAL_ISSUER ?? process.env.KEYCLOAK_ISSUER ?? keycloakPublicIssuer();
}

function requiredEnv(name: string) {
  const value = process.env[name];
  const isBuild = process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build";
  if (!value && isBuild) return "build-time-placeholder";
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function rolesFromAccessToken(accessToken?: string) {
  if (!accessToken) return undefined;
  const [, payload] = accessToken.split(".");
  if (!payload) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { realm_access?: { roles?: string[] } };
    return decoded.realm_access?.roles;
  } catch {
    return undefined;
  }
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) return { ...token, error: "RefreshAccessTokenError" };

  try {
    const issuer = keycloakInternalIssuer();
    const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.KEYCLOAK_CLIENT_ID ?? "planner-web",
        client_secret: requiredEnv("KEYCLOAK_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: token.refreshToken
      })
    });

    const refreshed = await response.json();
    if (!response.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + Number(refreshed.expires_in ?? 60) * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: AuthOptions = {
  providers: [
    {
      id: "keycloak",
      name: "Keycloak",
      type: "oauth",
      clientId: process.env.KEYCLOAK_CLIENT_ID ?? "planner-web",
      clientSecret: requiredEnv("KEYCLOAK_CLIENT_SECRET"),
      issuer: keycloakPublicIssuer(),
      authorization: {
        url: `${keycloakPublicIssuer()}/protocol/openid-connect/auth`,
        params: { scope: "openid email profile" }
      },
      token: `${keycloakInternalIssuer()}/protocol/openid-connect/token`,
      userinfo: `${keycloakInternalIssuer()}/protocol/openid-connect/userinfo`,
      jwks_endpoint: `${keycloakInternalIssuer()}/protocol/openid-connect/certs`,
      checks: ["pkce", "state"],
      idToken: true,
      profile(profile: KeycloakProfile) {
        return {
          id: profile.sub,
          name: profile.name ?? profile.preferred_username,
          email: profile.email,
          image: profile.picture
        };
      }
    }
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  jwt: { maxAge: 8 * 60 * 60 },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : Date.now() + 55_000;
        token.roles = rolesFromAccessToken(account.access_token);
      }
      const realmRoles = (profile as { realm_access?: { roles?: string[] } } | undefined)?.realm_access?.roles;
      if (realmRoles) token.roles = realmRoles;
      if (!account && token.accessTokenExpires && Date.now() >= token.accessTokenExpires - 30_000) {
        return refreshAccessToken(token);
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.user.roles = token.roles;
      session.error = token.error;
      return session;
    }
  }
};
