import { Controller, ForbiddenException, Get } from "@nestjs/common";
import { CurrentUser } from "../../security/current-user.decorator";
import type { AuthenticatedUser } from "../../security/auth.types";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.ensureFromAuth(user);
  }

  @Get()
  async list(@CurrentUser() auth: AuthenticatedUser) {
    const user = await this.users.ensureFromAuth(auth);
    if (!["admin", "project_manager"].includes(user.primaryRole)) {
      throw new ForbiddenException("You cannot view the user directory");
    }
    return this.users.list();
  }
}
