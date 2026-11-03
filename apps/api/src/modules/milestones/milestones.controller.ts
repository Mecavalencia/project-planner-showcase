import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../../security/current-user.decorator";
import type { AuthenticatedUser } from "../../security/auth.types";
import { UsersService } from "../users/users.service";
import { PermissionsService } from "../permissions/permissions.service";
import { MilestonesService } from "./milestones.service";

@Controller()
export class MilestonesController {
  constructor(
    private readonly milestones: MilestonesService,
    private readonly users: UsersService,
    private readonly permissions: PermissionsService
  ) {}

  @Get("projects/:projectId/milestones")
  async list(@CurrentUser() auth: AuthenticatedUser, @Param("projectId") projectId: string) {
    const user = await this.users.ensureFromAuth(auth);
    await this.permissions.requireProjectView(projectId, user.id, user.primaryRole);
    return this.milestones.list(projectId);
  }

  @Post("projects/:projectId/milestones")
  async create(@CurrentUser() auth: AuthenticatedUser, @Param("projectId") projectId: string, @Body() body: unknown) {
    const user = await this.users.ensureFromAuth(auth);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.milestones.create(projectId, user.id, body);
  }

  @Patch("milestones/:milestoneId")
  async update(@CurrentUser() auth: AuthenticatedUser, @Param("milestoneId") milestoneId: string, @Body() body: unknown) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.milestones.findProjectId(milestoneId);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.milestones.update(milestoneId, user.id, body);
  }

  @Post("milestones/:milestoneId/files")
  async linkFile(@CurrentUser() auth: AuthenticatedUser, @Param("milestoneId") milestoneId: string, @Body() body: unknown) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.milestones.findProjectId(milestoneId);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.milestones.linkFile(milestoneId, user.id, body);
  }

  @Delete("milestones/:milestoneId/files/:vaultItemId")
  async unlinkFile(@CurrentUser() auth: AuthenticatedUser, @Param("milestoneId") milestoneId: string, @Param("vaultItemId") vaultItemId: string) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.milestones.findProjectId(milestoneId);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.milestones.unlinkFile(milestoneId, vaultItemId, user.id);
  }
}
