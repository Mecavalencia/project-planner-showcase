import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser } from "../../security/auth.types";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureFromAuth(auth: AuthenticatedUser) {
    const primaryRole = auth.roles.includes("admin")
      ? "admin"
      : auth.roles.includes("project_manager")
        ? "project_manager"
        : auth.roles.includes("external_client")
          ? "external_client"
          : auth.roles.includes("viewer")
            ? "viewer"
            : "member";

    return this.prisma.user.upsert({
      where: { email: auth.email },
      update: {
        keycloakSub: auth.sub,
        username: auth.username,
        firstName: auth.firstName ?? "",
        lastName: auth.lastName ?? "",
        displayName: auth.name,
        locale: auth.locale ?? "en",
        primaryRole,
        deletedAt: null
      },
      create: {
        keycloakSub: auth.sub,
        username: auth.username,
        email: auth.email,
        firstName: auth.firstName ?? "",
        lastName: auth.lastName ?? "",
        displayName: auth.name,
        locale: auth.locale ?? "en",
        primaryRole,
        isExternal: primaryRole === "external_client"
      }
    });
  }

  list() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { displayName: "asc" },
      select: { id: true, username: true, email: true, firstName: true, lastName: true, displayName: true, locale: true, primaryRole: true, isExternal: true, company: true }
    });
  }
}
