import { Controller, Get, Param } from "@nestjs/common";
import { CurrentUser } from "../../security/current-user.decorator";
import type { AuthenticatedUser } from "../../security/auth.types";
import { PrismaService } from "../../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { PermissionsService } from "../permissions/permissions.service";
import { calculateMilestoneProgress } from "@planner/shared";

@Controller("projects/:projectId/gantt")
export class GanttController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly permissions: PermissionsService
  ) {}

  @Get()
  async get(@CurrentUser() auth: AuthenticatedUser, @Param("projectId") projectId: string) {
    const user = await this.users.ensureFromAuth(auth);
    await this.permissions.requireProjectView(projectId, user.id, user.primaryRole);
    const [milestones, tasks] = await Promise.all([
      this.prisma.milestone.findMany({
        where: { projectId, isActive: true },
        include: { tasks: true },
        orderBy: [{ sortOrder: "asc" }, { plannedEndAt: "asc" }]
      }),
      this.prisma.task.findMany({
      where: { projectId },
      include: { milestone: true, category: true, assignments: { include: { user: true } } },
      orderBy: [{ sortOrder: "asc" }, { priority: "desc" }, { plannedStartAt: "asc" }, { createdAt: "asc" }]
      })
    ]);

    const milestoneRows = milestones.map((milestone) => {
      const range = resolveMilestoneRange(milestone);
      const progress = calculateMilestoneProgress({
        tasks: milestone.tasks.map((task) => ({ progressPercent: task.progressPercent, estimatedHours: Number(task.estimatedHours ?? 0) })),
        plannedStartAt: range.start,
        plannedEndAt: range.end
      });
      return {
        id: milestone.id,
        type: "milestone",
        name: milestone.name,
        start: range.start?.toISOString().slice(0, 10),
        end: range.end?.toISOString().slice(0, 10),
        progress: progress.progressPercent,
        timeProgress: progress.timeProgressPercent,
        custom_class: "milestone",
        sortOrder: milestone.sortOrder,
        taskCount: milestone.tasks.length
      };
    });

    const taskRows = tasks.map((task) => ({
      id: task.id,
      type: "task",
      milestoneId: task.milestoneId,
      name: task.title,
      start: task.plannedStartAt?.toISOString().slice(0, 10),
      end: task.plannedEndAt?.toISOString().slice(0, 10),
      progress: task.progressPercent,
      custom_class: task.status,
      status: task.status,
      priority: task.priority,
      sortOrder: task.sortOrder,
      category: task.category?.name,
      color: task.category?.color,
      responsible: task.assignments.map((assignment) => assignment.user.displayName).join(", ")
    }));

    return [...milestoneRows, ...taskRows];
  }
}

function resolveMilestoneRange(milestone: { plannedStartAt: Date | null; plannedEndAt: Date | null; tasks: Array<{ plannedStartAt: Date | null; plannedEndAt: Date | null }> }) {
  const taskStarts = milestone.tasks.map((task) => task.plannedStartAt).filter(Boolean).map((date) => date!.getTime());
  const taskEnds = milestone.tasks.map((task) => task.plannedEndAt).filter(Boolean).map((date) => date!.getTime());
  const start = milestone.plannedStartAt ?? (taskStarts.length ? new Date(Math.min(...taskStarts)) : null);
  const end = milestone.plannedEndAt ?? (taskEnds.length ? new Date(Math.max(...taskEnds)) : null);
  return { start, end };
}
