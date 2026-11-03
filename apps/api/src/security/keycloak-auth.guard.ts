import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import jwt, { JwtHeader, JwtPayload } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { AuthenticatedUser } from "./auth.types";
import type { GlobalRole } from "@planner/shared";

const clientCache = new Map<string, jwksClient.JwksClient>();

@Injectable()
export class KeycloakAuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const devEmail = request.headers["x-dev-user"];
    if (process.env.ALLOW_DEV_AUTH === "true" && typeof devEmail === "string") {
      request.user = {
        sub: `dev:${devEmail}`,
        email: devEmail,
        username: devEmail.split("@")[0],
        name: devEmail,
        firstName: devEmail.split("@")[0],
        lastName: "",
        locale: "en",
        roles: ["admin", "project_manager"]
      } satisfies AuthenticatedUser;
      return true;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const token = authHeader.slice("Bearer ".length);
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === "string") {
      throw new UnauthorizedException("Invalid token");
    }

    const issuer =
      process.env.KEYCLOAK_TOKEN_ISSUER ??
      process.env.KEYCLOAK_PUBLIC_ISSUER ??
      process.env.KEYCLOAK_ISSUER ??
      "http://localhost:8080/realms/planner";
    const jwksIssuer = process.env.KEYCLOAK_INTERNAL_ISSUER ?? process.env.KEYCLOAK_ISSUER ?? issuer;
    const publicKey = await this.getPublicKey(jwksIssuer, decoded.header);
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, publicKey, { issuer }) as JwtPayload;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
    const email = String(payload.email ?? payload.preferred_username ?? "");
    if (!email) throw new UnauthorizedException("Token does not include email");

    const realmRoles = (payload.realm_access as { roles?: string[] } | undefined)?.roles ?? [];
    const roles = realmRoles.filter((role): role is GlobalRole =>
      ["admin", "project_manager", "member", "external_client", "viewer"].includes(role)
    );

    request.user = {
      sub: String(payload.sub),
      email,
      username: String(payload.preferred_username ?? email.split("@")[0]),
      name: String(payload.name ?? payload.preferred_username ?? email),
      firstName: typeof payload.given_name === "string" ? payload.given_name : undefined,
      lastName: typeof payload.family_name === "string" ? payload.family_name : undefined,
      locale: typeof payload.locale === "string" ? payload.locale : "en",
      roles
    } satisfies AuthenticatedUser;
    return true;
  }

  private async getPublicKey(issuer: string, header: JwtHeader): Promise<string> {
    if (!header.kid) throw new UnauthorizedException("Token has no kid");
    const jwksUri = `${issuer}/protocol/openid-connect/certs`;
    let client = clientCache.get(jwksUri);
    if (!client) {
      client = jwksClient({ jwksUri, cache: true, cacheMaxEntries: 5, cacheMaxAge: 10 * 60 * 1000 });
      clientCache.set(jwksUri, client);
    }
    const key = await client.getSigningKey(header.kid);
    return key.getPublicKey();
  }
}
