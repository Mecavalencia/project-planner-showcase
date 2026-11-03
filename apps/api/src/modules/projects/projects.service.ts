import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateProjectSchema } from "@planner/shared";
import { AuditService } from "../audit/audit.service";
import { UsersService } from "../users/users.service";
import type { AuthenticatedUser } from "../../security/auth.types";

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService
  ) {}

  async list(auth: AuthenticatedUser) {
    const user = await this.users.ensureFromAuth(auth);
    const isAdmin = user.primaryRole === "admin";
    const projects = await this.prisma.project.findMany({
      where: isAdmin ? {} : { members: { some: { userId: user.id, status: "active" } } },
      include: {
        clientCompany: true,
        members: { include: { user: true } },
        milestones: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { plannedEndAt: "asc" }] },
        categories: { orderBy: { sortOrder: "asc" } },
        tasks: {
          include: {
            milestone: true,
            category: true,
            steps: { orderBy: { sortOrder: "asc" } },
            assignments: { include: { user: true } },
            comments: { include: { author: true }, orderBy: { createdAt: "desc" } },
            files: { include: { vaultItem: true } }
          },
          orderBy: [{ sortOrder: "asc" }, { priority: "desc" }, { plannedStartAt: "asc" }, { createdAt: "asc" }]
        },
        vaultItems: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } }
      },
      orderBy: { updatedAt: "desc" }
    });

    return projects.map((project) => this.withHealth(project));
  }

  async get(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        clientCompany: true,
        members: { include: { user: true } },
        milestones: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { plannedEndAt: "asc" }] },
        categories: { orderBy: { sortOrder: "asc" } },
        tasks: {
          include: {
            milestone: true,
            category: true,
            steps: { orderBy: { sortOrder: "asc" } },
            assignments: { include: { user: true } },
            comments: { include: { author: true }, orderBy: { createdAt: "desc" } },
            files: { include: { vaultItem: true } }
          },
          orderBy: [{ sortOrder: "asc" }, { priority: "desc" }, { plannedStartAt: "asc" }, { createdAt: "asc" }]
        },
        vaultItems: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } }
      }
    });
    if (!project) throw new NotFoundException("Project not found");
    return this.withHealth(project);
  }

  async create(auth: AuthenticatedUser, rawBody: unknown) {
    const body = CreateProjectSchema.parse(rawBody);
    const user = await this.users.ensureFromAuth(auth);
    const clientCompany = await this.prisma.company.upsert({
      where: { name: body.clientCompanyName },
      update: {},
      create: { name: body.clientCompanyName, type: "client" }
    });
    const project = await this.prisma.project.create({
      data: {
        name: body.name,
        manufacturingOrder: body.manufacturingOrder,
        description: body.description,
        clientCompanyId: clientCompany.id,
        ownerUserId: user.id,
        projectManagerId: user.id,
        color: nextProjectColor(user.id),
        budgetedHours: body.budgetedHours,
        plannedStartDate: body.plannedStartDate ? new Date(body.plannedStartDate) : undefined,
        plannedEndDate: body.plannedEndDate ? new Date(body.plannedEndDate) : undefined,
        members: { create: { userId: user.id, projectRole: "project_manager" } },
        vaultItems: {
          create: [
            { itemType: "folder", name: "00_Proposal_and_scope", normalizedName: "00_proposal_and_scope", uploadedById: user.id },
            { itemType: "folder", name: "01_Requirements", normalizedName: "01_requirements", uploadedById: user.id },
            { itemType: "folder", name: "02_Technical_design", normalizedName: "02_technical_design", uploadedById: user.id },
            { itemType: "folder", name: "05_Deliverables", normalizedName: "05_deliverables", uploadedById: user.id }
          ]
        }
      },
      include: { clientCompany: true, members: { include: { user: true } }, milestones: true, categories: true, tasks: true }
    });

    const categorySet = await this.prisma.categorySet.create({
      data: {
        projectId: project.id,
        name: "Industrial software",
        description: "Base structure for data capture, software, and plant projects."
      }
    });
    await this.prisma.taskCategory.createMany({
      data: [
        { projectId: project.id, categorySetId: categorySet.id, name: "Data capture", color: "#79a7a8", icon: "radio", sortOrder: 1 },
        { projectId: project.id, categorySetId: categorySet.id, name: "Processing", color: "#9a89b8", icon: "workflow", sortOrder: 2 },
        { projectId: project.id, categorySetId: categorySet.id, name: "Backend", color: "#8ca77b", icon: "server", sortOrder: 3 },
        { projectId: project.id, categorySetId: categorySet.id, name: "Frontend", color: "#d19a66", icon: "layout", sortOrder: 4 },
        { projectId: project.id, categorySetId: categorySet.id, name: "Database", color: "#6f9fc8", icon: "database", sortOrder: 5 },
        { projectId: project.id, categorySetId: categorySet.id, name: "Plant", color: "#c9847a", icon: "factory", sortOrder: 6 },
        { projectId: project.id, categorySetId: categorySet.id, name: "Testing", color: "#b2a35f", icon: "check", sortOrder: 7 }
      ]
    });

    await this.audit.record({
      projectId: project.id,
      actorUserId: user.id,
      entityType: "project",
      entityId: project.id,
      action: "project.created",
      afterJson: { name: project.name }
    });

    return this.get(project.id);
  }

  async update(projectId: string, body: Record<string, unknown>, actorUserId: string) {
    const before = await this.prisma.project.findUnique({ where: { id: projectId } });
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        name: typeof body.name === "string" ? body.name : undefined,
        manufacturingOrder: typeof body.manufacturingOrder === "string" ? body.manufacturingOrder.trim() : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        color: typeof body.color === "string" ? body.color : undefined,
        budgetedHours: typeof body.budgetedHours === "number" ? body.budgetedHours : undefined
      }
    });
    await this.audit.record({
      projectId,
      actorUserId,
      entityType: "project",
      entityId: projectId,
      action: "project.updated",
      beforeJson: before,
      afterJson: project
    });
    return project;
  }

  async addMember(projectId: string, body: { userId: string; projectRole: string }, actorUserId: string) {
    const member = await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: body.userId } },
      update: { projectRole: body.projectRole as never, status: "active" },
      create: { projectId, userId: body.userId, projectRole: body.projectRole as never }
    });
    await this.audit.record({
      projectId,
      actorUserId,
      entityType: "project_member",
      entityId: member.id,
      action: "member.added",
      afterJson: member
    });
    return member;
  }

  private withHealth(project: any) {
    const tasks = project.tasks ?? [];
    const estimatedHours = tasks.reduce((sum: number, task: any) => sum + Number(task.estimatedHours ?? 0), 0);
    const actualHours = tasks.reduce((sum: number, task: any) => sum + Number(task.actualHours ?? 0), 0);
    const budgetedHours = Number(project.budgetedHours ?? 0);
    return {
      ...project,
      tasks: tasks.map((task: any) => ({
        ...task,
        files: (task.files ?? []).map((file: any) => ({
          ...file,
          vaultItem: file.vaultItem
            ? {
                ...file.vaultItem,
                sizeBytes: file.vaultItem.sizeBytes === null || file.vaultItem.sizeBytes === undefined ? null : file.vaultItem.sizeBytes.toString()
              }
            : file.vaultItem
        }))
      })),
      vaultItems: (project.vaultItems ?? []).map((item: any) => ({
        ...item,
        sizeBytes: item.sizeBytes === null || item.sizeBytes === undefined ? null : item.sizeBytes.toString()
      })),
      health: {
        budgetedHours,
        estimatedHours,
        actualHours,
        remainingHours: budgetedHours - actualHours,
        projectedHours: actualHours + estimatedHours,
        usagePercent: budgetedHours === 0 ? 0 : Math.round((actualHours / budgetedHours) * 100),
        tasksTotal: tasks.length,
        tasksDone: tasks.filter((task: any) => ["done", "accepted"].includes(task.status)).length,
        tasksBlocked: tasks.filter((task: any) => task.status === "blocked").length
      }
    };
  }
}

function nextProjectColor(seed: string) {
  const palette = ["#6f9fc8", "#8ca77b", "#d19a66", "#9a89b8", "#c9847a", "#79a7a8", "#b2a35f", "#5f8f9f"];
  const hash = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}
