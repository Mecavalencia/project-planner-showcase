import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const manageRoles = ["owner", "project_manager", "editor"];

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async requireProjectView(projectId: string, userId: string, globalRole?: string) {
    if (globalRole === "admin") return;
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } }
    });
    if (!membership || membership.status !== "active") {
      throw new ForbiddenException("You do not have access to this project");
    }
  }

  async requireProjectManage(projectId: string, userId: string, globalRole?: string) {
    if (globalRole === "admin") return;
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } }
    });
    if (!membership) throw new NotFoundException("Member not found");
    if (!manageRoles.includes(membership.projectRole)) {
      throw new ForbiddenException("You cannot modify this project");
    }
  }

  canManageRole(role?: string) {
    return role === "admin" || role === "project_manager";
  }
}
