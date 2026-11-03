import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../../security/current-user.decorator";
import type { AuthenticatedUser } from "../../security/auth.types";
import { ProjectsService } from "./projects.service";
import { PermissionsService } from "../permissions/permissions.service";
import { UsersService } from "../users/users.service";

@Controller("projects")
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly permissions: PermissionsService,
    private readonly users: UsersService
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.projects.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.projects.create(user, body);
  }

  @Get(":projectId")
  async get(@CurrentUser() auth: AuthenticatedUser, @Param("projectId") projectId: string) {
    const user = await this.users.ensureFromAuth(auth);
    await this.permissions.requireProjectView(projectId, user.id, user.primaryRole);
    return this.projects.get(projectId);
  }

  @Patch(":projectId")
  async update(@CurrentUser() auth: AuthenticatedUser, @Param("projectId") projectId: string, @Body() body: Record<string, unknown>) {
    const user = await this.users.ensureFromAuth(auth);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.projects.update(projectId, body, user.id);
  }

  @Post(":projectId/members")
  async addMember(@CurrentUser() auth: AuthenticatedUser, @Param("projectId") projectId: string, @Body() body: { userId: string; projectRole: string }) {
    const user = await this.users.ensureFromAuth(auth);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.projects.addMember(projectId, body, user.id);
  }
}
