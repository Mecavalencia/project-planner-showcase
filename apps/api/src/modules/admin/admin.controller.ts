import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../../security/current-user.decorator";
import type { AuthenticatedUser } from "../../security/auth.types";
import { Public } from "../../security/public.decorator";
import { UsersService } from "../users/users.service";
import { AdminService } from "./admin.service";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly users: UsersService
  ) {}

  @Public()
  @Get("setup")
  async setupStatus() {
    return this.admin.setupStatus();
  }

  @Public()
  @Post("setup/first-admin")
  async createFirstAdmin(@Body() body: unknown) {
    return this.admin.createFirstAdmin(body);
  }

  @Get("users")
  async listUsers(@CurrentUser() auth: AuthenticatedUser) {
    await this.requireAdmin(auth);
    return this.admin.listUsers();
  }

  @Post("users")
  async createUser(@CurrentUser() auth: AuthenticatedUser, @Body() body: unknown) {
    await this.requireAdmin(auth);
    return this.admin.createUser(body);
  }

  @Patch("users/:userId")
  async updateUser(@CurrentUser() auth: AuthenticatedUser, @Param("userId") userId: string, @Body() body: unknown) {
    await this.requireAdmin(auth);
    return this.admin.updateUser(userId, body);
  }

  @Delete("users/:userId")
  async deleteUser(@CurrentUser() auth: AuthenticatedUser, @Param("userId") userId: string) {
    const actor = await this.requireAdmin(auth);
    return this.admin.deleteUser(userId, actor.id);
  }

  @Get("users/:userId/workload")
  async workload(@CurrentUser() auth: AuthenticatedUser, @Param("userId") userId: string, @Query("from") from?: string, @Query("to") to?: string) {
    await this.requireAdmin(auth);
    return this.admin.workload(userId, from, to);
  }

  private async requireAdmin(auth: AuthenticatedUser) {
    const user = await this.users.ensureFromAuth(auth);
    if (user.primaryRole !== "admin") throw new ForbiddenException("Only administrators can access this section");
    return user;
  }
}
