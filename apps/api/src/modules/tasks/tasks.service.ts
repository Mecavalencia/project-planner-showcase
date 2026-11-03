import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTaskSchema, TaskStepInputSchema, UpdateTaskOrderSchema, UpdateTaskScheduleSchema, calculateTaskProgressFromSteps, canTransitionTask } from "@planner/shared";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(projectId: string) {
    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      include: {
        category: true,
        milestone: true,
        steps: { orderBy: { sortOrder: "asc" } },
        assignments: { include: { user: true } },
        comments: { include: { author: true }, orderBy: { createdAt: "desc" } },
        files: { include: { vaultItem: true } }
      },
      orderBy: [{ sortOrder: "asc" }, { priority: "desc" }, { plannedStartAt: "asc" }, { createdAt: "asc" }]
    });
    return tasks.map(serializeTask);
  }

  async findProjectId(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true }
    });
    if (!task) throw new NotFoundException("Task not found");
    return task.projectId;
  }

  async create(projectId: string, actorUserId: string, rawBody: unknown) {
    const body = CreateTaskSchema.parse(rawBody);
    const responsibleUserIds = uniqueUserIds([...body.responsibleUserIds, ...(body.responsibleUserId ? [body.responsibleUserId] : [])]);
    const aggregate = await this.prisma.task.aggregate({
      where: { projectId },
      _max: { sortOrder: true }
    });
    if (body.milestoneId) await this.requireMilestoneInProject(body.milestoneId, projectId);
    const taskStepData = normalizeTaskSteps(body.steps);
    const taskMetrics = taskStepData.length > 0 ? calculateTaskMetrics(taskStepData) : { estimatedHours: body.estimatedHours, progressPercent: body.progressPercent };
    const task = await this.prisma.task.create({
      data: {
        projectId,
        milestoneId: body.milestoneId ?? undefined,
        categoryId: body.categoryId ?? undefined,
        title: body.title,
        description: body.description,
        plannedStartAt: body.plannedStartAt ? new Date(body.plannedStartAt) : undefined,
        plannedEndAt: body.plannedEndAt ? new Date(body.plannedEndAt) : undefined,
        deadlineAt: body.deadlineAt ? new Date(body.deadlineAt) : undefined,
        estimatedHours: taskMetrics.estimatedHours,
        progressPercent: taskMetrics.progressPercent,
        priority: body.priority,
        sortOrder: (aggregate._max.sortOrder ?? -1) + 1,
        createdById: actorUserId,
        steps: taskStepData.length > 0 ? { create: taskStepData } : undefined,
        assignments: responsibleUserIds.length > 0
          ? { create: responsibleUserIds.map((userId) => ({ userId, assignmentRole: "responsible", estimatedHours: taskMetrics.estimatedHours })) }
          : undefined
      },
      include: { milestone: true, category: true, steps: { orderBy: { sortOrder: "asc" } }, assignments: { include: { user: true } } }
    });
    await this.audit.record({
      projectId,
      actorUserId,
      entityType: "task",
      entityId: task.id,
      action: "task.created",
      afterJson: task
    });
    return task;
  }

  async update(taskId: string, actorUserId: string, body: Record<string, unknown>) {
    const before = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!before) throw new NotFoundException("Task not found");
    const responsibleUserIds = extractResponsibleUserIds(body);
    const hasAssignmentUpdate = responsibleUserIds !== undefined;
    const taskStepData = Object.prototype.hasOwnProperty.call(body, "steps") ? normalizeTaskSteps(body.steps) : undefined;
    const taskStepMetrics = taskStepData ? calculateTaskMetrics(taskStepData) : undefined;
    const requestedStatus = typeof body.status === "string" ? body.status : undefined;
    if (requestedStatus && !canTransitionTask(before.status as never, requestedStatus as never)) {
      throw new BadRequestException(`Transicion no permitida: ${before.status} -> ${requestedStatus}`);
    }
    if (typeof body.milestoneId === "string") await this.requireMilestoneInProject(body.milestoneId, before.projectId);
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: {
          title: typeof body.title === "string" ? body.title : undefined,
          description: typeof body.description === "string" ? body.description : undefined,
          milestoneId: typeof body.milestoneId === "string" ? body.milestoneId : body.milestoneId === null ? null : undefined,
          categoryId: typeof body.categoryId === "string" ? body.categoryId : body.categoryId === null ? null : undefined,
          status: requestedStatus as never,
          priority: typeof body.priority === "string" ? (body.priority as never) : undefined,
          plannedStartAt: typeof body.plannedStartAt === "string" ? new Date(body.plannedStartAt) : body.plannedStartAt === null ? null : undefined,
          plannedEndAt: typeof body.plannedEndAt === "string" ? new Date(body.plannedEndAt) : body.plannedEndAt === null ? null : undefined,
          deadlineAt: typeof body.deadlineAt === "string" ? new Date(body.deadlineAt) : body.deadlineAt === null ? null : undefined,
          estimatedHours: taskStepMetrics
            ? taskStepMetrics.estimatedHours
            : typeof body.estimatedHours === "number"
              ? body.estimatedHours
              : undefined,
          actualHours: typeof body.actualHours === "number" ? body.actualHours : undefined,
          progressPercent: taskStepMetrics
            ? taskStepMetrics.progressPercent
            : typeof body.progressPercent === "number"
              ? Math.max(0, Math.min(100, Math.round(body.progressPercent)))
              : undefined,
          qualityRating: typeof body.qualityRating === "number" ? body.qualityRating : undefined,
          feedbackStatus: typeof body.feedbackStatus === "string" ? (body.feedbackStatus as never) : undefined,
          feedbackNotes: typeof body.feedbackNotes === "string" ? body.feedbackNotes : undefined
        }
      });

      if (taskStepData) {
        await tx.taskStep.deleteMany({ where: { taskId } });
        if (taskStepData.length > 0) {
          await tx.taskStep.createMany({ data: taskStepData.map((step) => ({ ...step, taskId })) });
        }
      }
    });
    if (hasAssignmentUpdate) {
      await this.prisma.taskAssignment.deleteMany({ where: { taskId } });
      if (responsibleUserIds.length > 0) {
        await this.prisma.taskAssignment.createMany({
          data: responsibleUserIds.map((userId) => ({
            taskId,
            userId,
            assignmentRole: "responsible",
            estimatedHours: taskStepMetrics ? taskStepMetrics.estimatedHours : typeof body.estimatedHours === "number" ? body.estimatedHours : before.estimatedHours
          })),
          skipDuplicates: true
        });
      }
    }
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { milestone: true, category: true, steps: { orderBy: { sortOrder: "asc" } }, assignments: { include: { user: true } }, comments: { include: { author: true } }, files: { include: { vaultItem: true } } }
    });
    if (!task) throw new NotFoundException("Task not found");
    await this.audit.record({
      projectId: before.projectId,
      actorUserId,
      entityType: "task",
      entityId: task.id,
      action: "task.updated",
      beforeJson: before,
      afterJson: task
    });
    return serializeTask(task);
  }

  async delete(taskId: string, actorUserId: string) {
    const before = await this.prisma.task.findUnique({ where: { id: taskId }, include: { assignments: true, files: true } });
    if (!before) throw new NotFoundException("Task not found");
    await this.prisma.timeEntry.updateMany({ where: { taskId }, data: { taskId: null } });
    await this.prisma.task.delete({ where: { id: taskId } });
    await this.audit.record({
      projectId: before.projectId,
      actorUserId,
      entityType: "task",
      entityId: taskId,
      action: "task.deleted",
      beforeJson: before
    });
    return { ok: true };
  }

  async linkFile(taskId: string, actorUserId: string, body: { vaultItemId: string }) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!task) throw new NotFoundException("Task not found");
    const vaultItem = await this.prisma.vaultItem.findUnique({
      where: { id: body.vaultItemId },
      select: { projectId: true, itemType: true, deletedAt: true }
    });
    if (!vaultItem || vaultItem.deletedAt || vaultItem.itemType !== "file") throw new NotFoundException("File not found");
    if (vaultItem.projectId !== task.projectId) throw new BadRequestException("The file does not belong to the task project");
    const link = await this.prisma.taskFile.upsert({
      where: { taskId_vaultItemId: { taskId, vaultItemId: body.vaultItemId } },
      update: { relationType: "attachment", linkedById: actorUserId },
      create: { taskId, vaultItemId: body.vaultItemId, relationType: "attachment", linkedById: actorUserId },
      include: { vaultItem: true }
    });
    await this.audit.record({
      projectId: task.projectId,
      actorUserId,
      entityType: "task_file",
      entityId: link.id,
      action: "task.file_linked",
      afterJson: { taskId, vaultItemId: body.vaultItemId }
    });
    return link;
  }

  async unlinkFile(taskId: string, vaultItemId: string, actorUserId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!task) throw new NotFoundException("Task not found");
    const link = await this.prisma.taskFile.delete({ where: { taskId_vaultItemId: { taskId, vaultItemId } } });
    await this.audit.record({
      projectId: task.projectId,
      actorUserId,
      entityType: "task_file",
      entityId: link.id,
      action: "task.file_unlinked",
      beforeJson: link
    });
    return { ok: true };
  }

  async start(taskId: string, actorUserId: string) {
    const before = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!before) throw new NotFoundException("Task not found");
    if (!canTransitionTask(before.status as never, "in_progress")) {
      throw new BadRequestException("The task cannot be started from its current status");
    }
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: "in_progress", actualStartAt: new Date(), progressPercent: before.progressPercent || 5 }
    });
    await this.audit.record({
      projectId: before.projectId,
      actorUserId,
      entityType: "task",
      entityId: taskId,
      action: "task.started",
      beforeJson: before,
      afterJson: task
    });
    return task;
  }

  async pause(taskId: string, actorUserId: string) {
    const before = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!before) throw new NotFoundException("Task not found");
    if (!canTransitionTask(before.status as never, "paused")) {
      throw new BadRequestException("The task cannot be paused from its current status");
    }
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: "paused" }
    });
    await this.audit.record({
      projectId: before.projectId,
      actorUserId,
      entityType: "task",
      entityId: taskId,
      action: "task.paused",
      beforeJson: before,
      afterJson: task
    });
    return task;
  }

  async finish(taskId: string, actorUserId: string, body: { actualHours?: number; qualityRating?: number; feedbackNotes?: string }) {
    const before = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!before) throw new NotFoundException("Task not found");
    if (!["in_progress", "blocked", "in_review"].includes(before.status)) {
      throw new BadRequestException("The task is not in a finishable status");
    }
    const task = await this.prisma.$transaction(async (tx) => {
      await tx.taskStep.updateMany({ where: { taskId }, data: { progressPercent: 100 } });
      return tx.task.update({
        where: { id: taskId },
        data: {
          status: "done",
          actualEndAt: new Date(),
          progressPercent: 100,
          actualHours: body.actualHours ?? before.actualHours,
          qualityRating: body.qualityRating,
          feedbackNotes: body.feedbackNotes
        }
      });
    });
    await this.audit.record({
      projectId: before.projectId,
      actorUserId,
      entityType: "task",
      entityId: taskId,
      action: "task.finished",
      beforeJson: before,
      afterJson: task
    });
    return task;
  }

  async addComment(taskId: string, actorUserId: string, body: { body: string; visibility?: string }) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("Task not found");
    const comment = await this.prisma.taskComment.create({
      data: {
        taskId,
        authorId: actorUserId,
        body: body.body,
        visibility: (body.visibility ?? "project") as never
      },
      include: { author: true }
    });
    await this.audit.record({
      projectId: task.projectId,
      actorUserId,
      entityType: "task_comment",
      entityId: comment.id,
      action: "task.comment_added",
      afterJson: comment
    });
    return comment;
  }

  async updateSchedule(taskId: string, actorUserId: string, rawBody: unknown) {
    const body = UpdateTaskScheduleSchema.parse(rawBody);
    const before = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!before) throw new NotFoundException("Task not found");
    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        plannedStartAt: new Date(body.plannedStartAt),
        plannedEndAt: new Date(body.plannedEndAt),
        estimatedHours: body.estimatedHours
      }
    });
    await this.audit.record({
      projectId: before.projectId,
      actorUserId,
      entityType: "task",
      entityId: taskId,
      action: "gantt.task_schedule_changed",
      beforeJson: before,
      afterJson: task
    });
    return task;
  }

  async reorder(projectId: string, actorUserId: string, rawBody: unknown) {
    const body = UpdateTaskOrderSchema.parse(rawBody);
    const uniqueTaskIds = Array.from(new Set(body.taskIds));
    if (uniqueTaskIds.length !== body.taskIds.length) {
      throw new BadRequestException("The task list contains duplicates");
    }

    const tasks = await this.prisma.task.findMany({
      where: { projectId, id: { in: body.taskIds } },
      select: { id: true, sortOrder: true }
    });
    if (tasks.length !== body.taskIds.length) {
      throw new BadRequestException("All tasks must belong to the project");
    }

    await this.prisma.$transaction(
      body.taskIds.map((taskId, index) =>
        this.prisma.task.update({
          where: { id: taskId },
          data: { sortOrder: index }
        })
      )
    );

    await this.audit.record({
      projectId,
      actorUserId,
      entityType: "task",
      entityId: projectId,
      action: "gantt.task_order_changed",
      beforeJson: tasks,
      afterJson: body.taskIds.map((taskId, index) => ({ taskId, sortOrder: index }))
    });

    return { ok: true };
  }

  private async requireMilestoneInProject(milestoneId: string, projectId: string) {
    const milestone = await this.prisma.milestone.findUnique({ where: { id: milestoneId }, select: { projectId: true, isActive: true } });
    if (!milestone || milestone.projectId !== projectId || !milestone.isActive) {
      throw new BadRequestException("The milestone does not belong to the project");
    }
  }
}

function serializeTask(task: any) {
  return {
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
  };
}

function uniqueUserIds(userIds: string[]) {
  return Array.from(new Set(userIds.filter((userId) => typeof userId === "string" && userId.length > 0)));
}

function extractResponsibleUserIds(body: Record<string, unknown>) {
  if (Array.isArray(body.responsibleUserIds)) {
    return uniqueUserIds(body.responsibleUserIds.filter((value): value is string => typeof value === "string"));
  }
  if (typeof body.responsibleUserId === "string") return [body.responsibleUserId];
  if (body.responsibleUserId === null) return [];
  return undefined;
}

function normalizeTaskSteps(rawSteps: unknown) {
  const steps = TaskStepInputSchema.array().parse(Array.isArray(rawSteps) ? rawSteps : []);
  const normalized = steps
    .map((step, index) => ({
      title: step.title.trim(),
      description: step.description?.trim() ?? "",
      sortOrder: step.sortOrder ?? index,
      estimatedHours: step.estimatedHours,
      weightPercent: step.weightPercent,
      progressPercent: step.progressPercent
    }))
    .filter((step) => step.title.length > 0);

  const totalWeight = normalized.reduce((sum, step) => sum + step.weightPercent, 0);
  if (normalized.length > 0 && totalWeight !== 100) {
    throw new BadRequestException("Step weights must add up to 100%");
  }

  return normalized;
}

function calculateTaskMetrics(steps: ReturnType<typeof normalizeTaskSteps>) {
  return calculateTaskProgressFromSteps({
    steps: steps.map((step) => ({
      progressPercent: step.progressPercent,
      weightPercent: step.weightPercent,
      estimatedHours: Number(step.estimatedHours ?? 0)
    }))
  });
}
