import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../../security/current-user.decorator";
import type { AuthenticatedUser } from "../../security/auth.types";
import { TasksService } from "./tasks.service";
import { UsersService } from "../users/users.service";
import { PermissionsService } from "../permissions/permissions.service";

@Controller()
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly users: UsersService,
    private readonly permissions: PermissionsService
  ) {}

  @Get("projects/:projectId/tasks")
  async list(@CurrentUser() auth: AuthenticatedUser, @Param("projectId") projectId: string) {
    const user = await this.users.ensureFromAuth(auth);
    await this.permissions.requireProjectView(projectId, user.id, user.primaryRole);
    return this.tasks.list(projectId);
  }

  @Post("projects/:projectId/tasks")
  async create(@CurrentUser() auth: AuthenticatedUser, @Param("projectId") projectId: string, @Body() body: unknown) {
    const user = await this.users.ensureFromAuth(auth);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.tasks.create(projectId, user.id, body);
  }

  @Patch("projects/:projectId/tasks/order")
  async reorder(@CurrentUser() auth: AuthenticatedUser, @Param("projectId") projectId: string, @Body() body: unknown) {
    const user = await this.users.ensureFromAuth(auth);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.tasks.reorder(projectId, user.id, body);
  }

  @Patch("tasks/:taskId")
  async update(@CurrentUser() auth: AuthenticatedUser, @Param("taskId") taskId: string, @Body() body: Record<string, unknown>) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.tasks.findProjectId(taskId);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.tasks.update(taskId, user.id, body);
  }

  @Delete("tasks/:taskId")
  async delete(@CurrentUser() auth: AuthenticatedUser, @Param("taskId") taskId: string) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.tasks.findProjectId(taskId);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.tasks.delete(taskId, user.id);
  }

  @Post("tasks/:taskId/files")
  async linkFile(@CurrentUser() auth: AuthenticatedUser, @Param("taskId") taskId: string, @Body() body: { vaultItemId: string }) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.tasks.findProjectId(taskId);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.tasks.linkFile(taskId, user.id, body);
  }

  @Delete("tasks/:taskId/files/:vaultItemId")
  async unlinkFile(@CurrentUser() auth: AuthenticatedUser, @Param("taskId") taskId: string, @Param("vaultItemId") vaultItemId: string) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.tasks.findProjectId(taskId);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.tasks.unlinkFile(taskId, vaultItemId, user.id);
  }

  @Post("tasks/:taskId/start")
  async start(@CurrentUser() auth: AuthenticatedUser, @Param("taskId") taskId: string) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.tasks.findProjectId(taskId);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.tasks.start(taskId, user.id);
  }

  @Post("tasks/:taskId/pause")
  async pause(@CurrentUser() auth: AuthenticatedUser, @Param("taskId") taskId: string) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.tasks.findProjectId(taskId);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.tasks.pause(taskId, user.id);
  }

  @Post("tasks/:taskId/finish")
  async finish(@CurrentUser() auth: AuthenticatedUser, @Param("taskId") taskId: string, @Body() body: { actualHours?: number; qualityRating?: number; feedbackNotes?: string }) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.tasks.findProjectId(taskId);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.tasks.finish(taskId, user.id, body);
  }

  @Post("tasks/:taskId/comments")
  async comment(@CurrentUser() auth: AuthenticatedUser, @Param("taskId") taskId: string, @Body() body: { body: string; visibility?: string }) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.tasks.findProjectId(taskId);
    await this.permissions.requireProjectView(projectId, user.id, user.primaryRole);
    return this.tasks.addComment(taskId, user.id, body);
  }

  @Patch("tasks/:taskId/schedule")
  async schedule(@CurrentUser() auth: AuthenticatedUser, @Param("taskId") taskId: string, @Body() body: unknown) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.tasks.findProjectId(taskId);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.tasks.updateSchedule(taskId, user.id, body);
  }
}
