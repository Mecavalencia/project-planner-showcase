import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { PrismaService } from "../prisma/prisma.service";
import { KeycloakAuthGuard } from "../security/keycloak-auth.guard";
import { UsersController } from "./users/users.controller";
import { ProjectsController } from "./projects/projects.controller";
import { TasksController } from "./tasks/tasks.controller";
import { VaultController } from "./vault/vault.controller";
import { GanttController } from "./gantt/gantt.controller";
import { AuditController } from "./audit/audit.controller";
import { AdminController } from "./admin/admin.controller";
import { MilestonesController } from "./milestones/milestones.controller";
import { UsersService } from "./users/users.service";
import { ProjectsService } from "./projects/projects.service";
import { TasksService } from "./tasks/tasks.service";
import { VaultService } from "./vault/vault.service";
import { AuditService } from "./audit/audit.service";
import { AdminService } from "./admin/admin.service";
import { MilestonesService } from "./milestones/milestones.service";
import { PermissionsService } from "./permissions/permissions.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] })],
  controllers: [UsersController, ProjectsController, TasksController, VaultController, GanttController, AuditController, AdminController, MilestonesController],
  providers: [
    PrismaService,
    UsersService,
    ProjectsService,
    TasksService,
    VaultService,
    AuditService,
    AdminService,
    MilestonesService,
    PermissionsService,
    {
      provide: APP_GUARD,
      useClass: KeycloakAuthGuard
    }
  ]
})
export class AppModule {}
