import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { calculateMilestoneProgress, CreateMilestoneSchema, LinkMilestoneFileSchema, UpdateMilestoneSchema } from "@planner/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class MilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(projectId: string) {
    const milestones = await this.prisma.milestone.findMany({
      where: { projectId, isActive: true },
      include: this.includeGraph(),
      orderBy: [{ sortOrder: "asc" }, { plannedEndAt: "asc" }, { createdAt: "asc" }]
    });
    return milestones.map((milestone) => this.withProgress(milestone));
  }

  async findProjectId(milestoneId: string) {
    const milestone = await this.prisma.milestone.findUnique({ where: { id: milestoneId }, select: { projectId: true } });
    if (!milestone) throw new NotFoundException("Milestone not found");
    return milestone.projectId;
  }

  async create(projectId: string, actorUserId: string, rawBody: unknown) {
    const body = CreateMilestoneSchema.parse(rawBody);
    const aggregate = await this.prisma.milestone.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    const milestone = await this.prisma.milestone.create({
      data: {
        projectId,
        name: body.name,
        description: body.description,
        plannedStartAt: body.plannedStartAt ? new Date(body.plannedStartAt) : undefined,
        plannedEndAt: body.plannedEndAt ? new Date(body.plannedEndAt) : undefined,
        sortOrder: body.sortOrder || (aggregate._max.sortOrder ?? -1) + 1
      },
      include: this.includeGraph()
    });
    await this.audit.record({
      projectId,
      actorUserId,
      entityType: "milestone",
      entityId: milestone.id,
      action: "milestone.created",
      afterJson: milestone
    });
    return this.withProgress(milestone);
  }

  async update(milestoneId: string, actorUserId: string, rawBody: unknown) {
    const body = UpdateMilestoneSchema.parse(rawBody);
    const before = await this.prisma.milestone.findUnique({ where: { id: milestoneId } });
    if (!before) throw new NotFoundException("Milestone not found");
    const milestone = await this.prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        name: body.name,
        description: body.description,
        plannedStartAt: typeof body.plannedStartAt === "string" ? new Date(body.plannedStartAt) : body.plannedStartAt === null ? null : undefined,
        plannedEndAt: typeof body.plannedEndAt === "string" ? new Date(body.plannedEndAt) : body.plannedEndAt === null ? null : undefined,
        sortOrder: body.sortOrder,
        isActive: body.isActive
      },
      include: this.includeGraph()
    });
    await this.audit.record({
      projectId: before.projectId,
      actorUserId,
      entityType: "milestone",
      entityId: milestone.id,
      action: "milestone.updated",
      beforeJson: before,
      afterJson: milestone
    });
    return this.withProgress(milestone);
  }

  async linkFile(milestoneId: string, actorUserId: string, rawBody: unknown) {
    const body = LinkMilestoneFileSchema.parse(rawBody);
    const milestone = await this.prisma.milestone.findUnique({ where: { id: milestoneId }, select: { projectId: true } });
    if (!milestone) throw new NotFoundException("Milestone not found");
    const vaultItem = await this.prisma.vaultItem.findUnique({ where: { id: body.vaultItemId }, select: { projectId: true } });
    if (!vaultItem) throw new NotFoundException("File not found");
    if (vaultItem.projectId !== milestone.projectId) throw new BadRequestException("The file does not belong to the milestone project");

    const link = await this.prisma.milestoneFile.upsert({
      where: { milestoneId_vaultItemId: { milestoneId, vaultItemId: body.vaultItemId } },
      update: { linkedById: actorUserId },
      create: { milestoneId, vaultItemId: body.vaultItemId, linkedById: actorUserId },
      include: { vaultItem: true }
    });
    await this.audit.record({
      projectId: milestone.projectId,
      actorUserId,
      entityType: "milestone_file",
      entityId: link.id,
      action: "milestone.file_linked",
      afterJson: link
    });
    return link;
  }

  async unlinkFile(milestoneId: string, vaultItemId: string, actorUserId: string) {
    const milestone = await this.prisma.milestone.findUnique({ where: { id: milestoneId }, select: { projectId: true } });
    if (!milestone) throw new NotFoundException("Milestone not found");
    const link = await this.prisma.milestoneFile.delete({
      where: { milestoneId_vaultItemId: { milestoneId, vaultItemId } }
    });
    await this.audit.record({
      projectId: milestone.projectId,
      actorUserId,
      entityType: "milestone_file",
      entityId: link.id,
      action: "milestone.file_unlinked",
      beforeJson: link
    });
    return { ok: true };
  }

  private includeGraph(): Prisma.MilestoneInclude {
    return {
      files: { include: { vaultItem: true } },
      tasks: {
        include: {
          category: true,
          steps: { orderBy: { sortOrder: "asc" } },
          assignments: { include: { user: true } },
          files: { include: { vaultItem: true } }
        },
        orderBy: [{ sortOrder: "asc" }, { plannedStartAt: "asc" }]
      }
    };
  }

  private withProgress(milestone: any) {
    const range = this.resolveMilestoneRange(milestone);
    const progress = calculateMilestoneProgress({
      tasks: (milestone.tasks ?? []).map((task: any) => ({
        progressPercent: Number(task.progressPercent ?? 0),
        estimatedHours: Number(task.estimatedHours ?? 0)
      })),
      plannedStartAt: range.start,
      plannedEndAt: range.end
    });

    return {
      ...milestone,
      resolvedStartAt: range.start,
      resolvedEndAt: range.end,
      progressPercent: progress.progressPercent,
      timeProgressPercent: progress.timeProgressPercent,
      documents: this.resolveDocuments(milestone)
    };
  }

  private resolveMilestoneRange(milestone: any) {
    const taskStarts = (milestone.tasks ?? []).map((task: any) => task.plannedStartAt).filter(Boolean).map((date: Date) => date.getTime());
    const taskEnds = (milestone.tasks ?? []).map((task: any) => task.plannedEndAt).filter(Boolean).map((date: Date) => date.getTime());
    const start = milestone.plannedStartAt ?? (taskStarts.length ? new Date(Math.min(...taskStarts)) : null);
    const end = milestone.plannedEndAt ?? (taskEnds.length ? new Date(Math.max(...taskEnds)) : null);
    return { start, end };
  }

  private resolveDocuments(milestone: any) {
    const documents = new Map<string, any>();
    for (const file of milestone.files ?? []) {
      documents.set(file.vaultItemId, { ...file.vaultItem, sources: ["manual"] });
    }
    for (const task of milestone.tasks ?? []) {
      for (const file of task.files ?? []) {
        const existing = documents.get(file.vaultItemId);
        if (existing) {
          existing.sources = Array.from(new Set([...existing.sources, "task"]));
          continue;
        }
        documents.set(file.vaultItemId, { ...file.vaultItem, sources: ["task"], taskId: task.id, taskTitle: task.title });
      }
    }
    return Array.from(documents.values());
  }
}
