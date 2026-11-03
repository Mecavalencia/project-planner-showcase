import { Controller, Get, Param } from "@nestjs/common";
import { CurrentUser } from "../../security/current-user.decorator";
import type { AuthenticatedUser } from "../../security/auth.types";
import { PrismaService } from "../../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { PermissionsService } from "../permissions/permissions.service";

@Controller("projects/:projectId/audit")
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly permissions: PermissionsService
  ) {}

  @Get()
  async list(@CurrentUser() auth: AuthenticatedUser, @Param("projectId") projectId: string) {
    const user = await this.users.ensureFromAuth(auth);
    await this.permissions.requireProjectView(projectId, user.id, user.primaryRole);
    return this.prisma.auditEvent.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { id: true, displayName: true, email: true } } },
      take: 100
    });
  }
}
