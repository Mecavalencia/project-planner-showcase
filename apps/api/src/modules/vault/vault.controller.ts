import { Body, Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../../security/current-user.decorator";
import type { AuthenticatedUser } from "../../security/auth.types";
import { VaultService } from "./vault.service";
import { UsersService } from "../users/users.service";
import { PermissionsService } from "../permissions/permissions.service";

@Controller()
export class VaultController {
  constructor(
    private readonly vault: VaultService,
    private readonly users: UsersService,
    private readonly permissions: PermissionsService
  ) {}

  @Get("projects/:projectId/vault")
  async list(@CurrentUser() auth: AuthenticatedUser, @Param("projectId") projectId: string) {
    const user = await this.users.ensureFromAuth(auth);
    await this.permissions.requireProjectView(projectId, user.id, user.primaryRole);
    return this.vault.list(projectId);
  }

  @Post("projects/:projectId/vault/folders")
  async createFolder(@CurrentUser() auth: AuthenticatedUser, @Param("projectId") projectId: string, @Body() body: { name: string; parentId?: string | null }) {
    const user = await this.users.ensureFromAuth(auth);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.vault.createFolder(projectId, user.id, body);
  }

  @Post("projects/:projectId/vault/files")
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @CurrentUser() auth: AuthenticatedUser,
    @Param("projectId") projectId: string,
    @UploadedFile() file: any,
    @Body() body: { parentId?: string | null; taskId?: string }
  ) {
    const user = await this.users.ensureFromAuth(auth);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.vault.uploadFile(projectId, user.id, file, body);
  }

  @Get("vault/items/:itemId/download")
  async download(@CurrentUser() auth: AuthenticatedUser, @Param("itemId") itemId: string) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.vault.findProjectId(itemId);
    await this.permissions.requireProjectView(projectId, user.id, user.primaryRole);
    return this.vault.signedDownloadUrl(itemId);
  }

  @Patch("vault/items/:itemId/permissions")
  async setPermission(@CurrentUser() auth: AuthenticatedUser, @Param("itemId") itemId: string, @Body() body: { subjectType: string; subjectId: string; permission: string }) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.vault.findProjectId(itemId);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.vault.setPermission(itemId, user.id, body);
  }

  @Patch("vault/items/:itemId/move")
  async moveItem(@CurrentUser() auth: AuthenticatedUser, @Param("itemId") itemId: string, @Body() body: { parentId?: string | null }) {
    const user = await this.users.ensureFromAuth(auth);
    const projectId = await this.vault.findProjectId(itemId);
    await this.permissions.requireProjectManage(projectId, user.id, user.primaryRole);
    return this.vault.moveItem(itemId, user.id, body);
  }
}
