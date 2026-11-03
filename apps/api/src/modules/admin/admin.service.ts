import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CreateAdminUserSchema, CreateFirstAdminSchema, GlobalRoleValues, UpdateAdminUserSchema } from "@planner/shared";
import type { GlobalRole } from "@planner/shared";
import { PrismaService } from "../../prisma/prisma.service";

type AdminUserInput = ReturnType<typeof CreateAdminUserSchema.parse>;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async setupStatus() {
    const activeUsers = await this.prisma.user.count({ where: { deletedAt: null } });
    return { needsFirstAdmin: activeUsers === 0 };
  }

  async createFirstAdmin(rawBody: unknown) {
    const status = await this.setupStatus();
    if (!status.needsFirstAdmin) {
      throw new BadRequestException("This instance already has users");
    }

    const body = CreateFirstAdminSchema.parse(rawBody);
    const activeUsers = await this.prisma.user.count({ where: { deletedAt: null } });
    if (activeUsers > 0) {
      throw new BadRequestException("This instance already has users");
    }

    return this.createUser({ ...body, role: "admin" });
  }

  async listUsers() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        locale: true,
        primaryRole: true,
        isExternal: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  async createUser(rawBody: unknown) {
    const body = CreateAdminUserSchema.parse(rawBody);
    const keycloakId = await this.createKeycloakUser(body);
    return this.prisma.user.upsert({
      where: { email: body.email },
      update: {
        keycloakSub: keycloakId,
        username: body.username,
        firstName: body.firstName,
        lastName: body.lastName,
        displayName: `${body.firstName} ${body.lastName}`.trim(),
        locale: body.locale,
        primaryRole: body.role,
        isExternal: body.role === "external_client"
      },
      create: {
        keycloakSub: keycloakId,
        username: body.username,
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        displayName: `${body.firstName} ${body.lastName}`.trim(),
        locale: body.locale,
        primaryRole: body.role,
        isExternal: body.role === "external_client"
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        locale: true,
        primaryRole: true,
        isExternal: true
      }
    });
  }

  async updateUser(userId: string, rawBody: unknown) {
    const body = UpdateAdminUserSchema.parse(rawBody);
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current || current.deletedAt) throw new NotFoundException("User not found");

    const next = {
      username: body.username?.trim() || current.username,
      email: body.email?.trim() || current.email,
      firstName: body.firstName?.trim() || current.firstName,
      lastName: body.lastName?.trim() || current.lastName,
      locale: body.locale ?? current.locale,
      primaryRole: body.role ?? current.primaryRole
    };

    await this.updateKeycloakUser(current.keycloakSub, current.username, {
      ...next,
      password: body.password || undefined,
      role: next.primaryRole as GlobalRole
    });

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        username: next.username,
        email: next.email,
        firstName: next.firstName,
        lastName: next.lastName,
        displayName: `${next.firstName} ${next.lastName}`.trim(),
        locale: next.locale,
        primaryRole: next.primaryRole,
        isExternal: next.primaryRole === "external_client"
      },
      select: {
        id: true,
        username: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        locale: true,
        primaryRole: true,
        isExternal: true
      }
    });
  }

  async deleteUser(userId: string, actorUserId: string) {
    if (userId === actorUserId) throw new BadRequestException("You cannot delete your own account");
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException("User not found");
    await this.disableKeycloakUser(user.keycloakSub, user.username);
    await this.prisma.projectMember.updateMany({ where: { userId }, data: { status: "removed" } });
    await this.prisma.taskAssignment.deleteMany({ where: { userId } });
    const suffix = `deleted_${Date.now()}`;
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        username: `${user.username}_${suffix}`,
        email: `${suffix}_${user.id}@deleted.local`,
        deletedAt: new Date()
      },
      select: { id: true, username: true, email: true, deletedAt: true }
    });
  }

  async workload(userId: string, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    const tasks = await this.prisma.task.findMany({
      where: {
        assignments: { some: { userId } },
        ...(fromDate || toDate
          ? {
              OR: [
                { plannedStartAt: null },
                { plannedEndAt: null },
                {
                  AND: [
                    fromDate ? { plannedEndAt: { gte: fromDate } } : {},
                    toDate ? { plannedStartAt: { lte: toDate } } : {}
                  ]
                }
              ]
            }
          : {})
      },
      include: {
        project: { select: { id: true, name: true, manufacturingOrder: true, color: true, clientCompany: true } },
        category: true,
        milestone: { select: { id: true, name: true } },
        steps: { orderBy: { sortOrder: "asc" } },
        assignments: { where: { userId }, include: { user: true } }
      },
      orderBy: [{ plannedStartAt: "asc" }, { plannedEndAt: "asc" }, { priority: "desc" }]
    });

    return tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      plannedStartAt: task.plannedStartAt,
      plannedEndAt: task.plannedEndAt,
      estimatedHours: task.estimatedHours,
      actualHours: task.actualHours,
      progressPercent: task.progressPercent,
      project: task.project,
      category: task.category,
      milestone: task.milestone,
      steps: task.steps,
      assignment: task.assignments[0] ?? null
    }));
  }

  private async createKeycloakUser(body: AdminUserInput) {
    const token = await this.getAdminToken();
    const baseUrl = this.keycloakBaseUrl();
    const realm = process.env.KEYCLOAK_REALM ?? "planner";
    const createResponse = await fetch(`${baseUrl}/admin/realms/${realm}/users`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: body.username,
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        enabled: true,
        emailVerified: true,
        attributes: { locale: [body.locale] },
        credentials: [{ type: "password", value: body.password, temporary: false }]
      })
    });

    if (createResponse.status === 409) {
      throw new BadRequestException("A user with this email or username already exists");
    }
    if (!createResponse.ok) {
      throw new BadRequestException("Could not create the user in Keycloak");
    }

    const userId = this.extractKeycloakId(createResponse.headers.get("location")) ?? await this.findKeycloakUserId(token, body.username);
    if (!userId) throw new BadRequestException("Keycloak did not return a user ID");
    await this.assignRealmRole(token, userId, body.role);
    return userId;
  }

  private async updateKeycloakUser(
    keycloakSub: string | null,
    fallbackUsername: string,
    body: { username: string; email: string; firstName: string; lastName: string; locale: string; password?: string; role: GlobalRole }
  ) {
    const token = await this.getAdminToken();
    const userId = keycloakSub ?? await this.findKeycloakUserId(token, fallbackUsername);
    if (!userId) return;
    const baseUrl = this.keycloakBaseUrl();
    const realm = process.env.KEYCLOAK_REALM ?? "planner";
    const response = await fetch(`${baseUrl}/admin/realms/${realm}/users/${userId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: body.username,
        email: body.email,
        firstName: body.firstName,
        lastName: body.lastName,
        enabled: true,
        emailVerified: true,
        attributes: { locale: [body.locale] }
      })
    });
    if (!response.ok) throw new BadRequestException("Could not update the user in Keycloak");
    if (body.password) await this.resetKeycloakPassword(token, userId, body.password);
    await this.replaceRealmRole(token, userId, body.role);
  }

  private async resetKeycloakPassword(token: string, userId: string, password: string) {
    const baseUrl = this.keycloakBaseUrl();
    const realm = process.env.KEYCLOAK_REALM ?? "planner";
    const response = await fetch(`${baseUrl}/admin/realms/${realm}/users/${userId}/reset-password`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ type: "password", value: password, temporary: false })
    });
    if (!response.ok) throw new BadRequestException("Could not update the password in Keycloak");
  }

  private async disableKeycloakUser(keycloakSub: string | null, fallbackUsername: string) {
    const token = await this.getAdminToken();
    const userId = keycloakSub ?? await this.findKeycloakUserId(token, fallbackUsername);
    if (!userId) return;
    const baseUrl = this.keycloakBaseUrl();
    const realm = process.env.KEYCLOAK_REALM ?? "planner";
    const response = await fetch(`${baseUrl}/admin/realms/${realm}/users/${userId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ enabled: false })
    });
    if (!response.ok) throw new BadRequestException("Could not disable the user in Keycloak");
  }

  private async getAdminToken() {
    const baseUrl = this.keycloakBaseUrl();
    const response = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: "admin-cli",
        grant_type: "password",
        username: requiredEnv("KEYCLOAK_ADMIN"),
        password: requiredEnv("KEYCLOAK_ADMIN_PASSWORD")
      })
    });
    if (!response.ok) throw new BadRequestException("Could not authenticate with Keycloak Admin");
    const payload = await response.json() as { access_token?: string };
    if (!payload.access_token) throw new BadRequestException("Keycloak Admin did not return a token");
    return payload.access_token;
  }

  private async findKeycloakUserId(token: string, username: string) {
    const baseUrl = this.keycloakBaseUrl();
    const realm = process.env.KEYCLOAK_REALM ?? "planner";
    const response = await fetch(`${baseUrl}/admin/realms/${realm}/users?username=${encodeURIComponent(username)}&exact=true`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return null;
    const users = await response.json() as Array<{ id?: string }>;
    return users[0]?.id ?? null;
  }

  private async assignRealmRole(token: string, userId: string, roleName: GlobalRole) {
    const baseUrl = this.keycloakBaseUrl();
    const realm = process.env.KEYCLOAK_REALM ?? "planner";
    const roleResponse = await fetch(`${baseUrl}/admin/realms/${realm}/roles/${roleName}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!roleResponse.ok) throw new BadRequestException("Could not find the Keycloak role");
    const role = await roleResponse.json();
    const assignResponse = await fetch(`${baseUrl}/admin/realms/${realm}/users/${userId}/role-mappings/realm`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([role])
    });
    if (!assignResponse.ok) throw new BadRequestException("Could not assign the Keycloak role");
  }

  private async replaceRealmRole(token: string, userId: string, roleName: GlobalRole) {
    const baseUrl = this.keycloakBaseUrl();
    const realm = process.env.KEYCLOAK_REALM ?? "planner";
    const mappingsResponse = await fetch(`${baseUrl}/admin/realms/${realm}/users/${userId}/role-mappings/realm`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!mappingsResponse.ok) throw new BadRequestException("Could not retrieve Keycloak roles");
    const currentRoles = await mappingsResponse.json() as Array<{ id: string; name: string }>;
    const appRoles = currentRoles.filter((role) => (GlobalRoleValues as readonly string[]).includes(role.name));
    if (appRoles.length > 0) {
      const deleteResponse = await fetch(`${baseUrl}/admin/realms/${realm}/users/${userId}/role-mappings/realm`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(appRoles)
      });
      if (!deleteResponse.ok) throw new BadRequestException("Could not replace Keycloak roles");
    }
    await this.assignRealmRole(token, userId, roleName);
  }

  private keycloakBaseUrl() {
    return (process.env.KEYCLOAK_INTERNAL_ISSUER ?? process.env.KEYCLOAK_ISSUER ?? "http://localhost:8080/realms/planner").replace(/\/realms\/[^/]+$/, "");
  }

  private extractKeycloakId(location: string | null) {
    if (!location) return null;
    return location.split("/").filter(Boolean).pop() ?? null;
  }
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}
