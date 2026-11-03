import { z } from "zod";

export const ProjectRoleValues = [
  "owner",
  "project_manager",
  "editor",
  "contributor",
  "viewer",
  "client_commenter"
] as const;

export const GlobalRoleValues = [
  "admin",
  "project_manager",
  "member",
  "external_client",
  "viewer"
] as const;

export const TaskStatusValues = [
  "planned",
  "should_start",
  "in_progress",
  "paused",
  "blocked",
  "in_review",
  "done",
  "accepted",
  "rejected",
  "cancelled"
] as const;

export const FeedbackStatusValues = [
  "conforme",
  "conforme_con_observaciones",
  "inconforme",
  "requiere_cambios"
] as const;

export const VaultPermissionValues = [
  "view",
  "download",
  "upload_child",
  "edit_metadata",
  "move",
  "delete",
  "manage_permissions"
] as const;

export const ProjectRoleSchema = z.enum(ProjectRoleValues);
export const GlobalRoleSchema = z.enum(GlobalRoleValues);
export const TaskStatusSchema = z.enum(TaskStatusValues);
export const FeedbackStatusSchema = z.enum(FeedbackStatusValues);
export const VaultPermissionSchema = z.enum(VaultPermissionValues);

export type ProjectRole = z.infer<typeof ProjectRoleSchema>;
export type GlobalRole = z.infer<typeof GlobalRoleSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;
export type VaultPermission = z.infer<typeof VaultPermissionSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().min(3),
  manufacturingOrder: z.string().trim().max(80).optional().default(""),
  description: z.string().optional().default(""),
  clientCompanyName: z.string().min(2),
  budgetedHours: z.coerce.number().nonnegative(),
  plannedStartDate: z.string().optional().nullable(),
  plannedEndDate: z.string().optional().nullable()
});

export const CreateTaskSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional().default(""),
  milestoneId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  responsibleUserId: z.string().uuid().optional().nullable(),
  responsibleUserIds: z.array(z.string().uuid()).optional().default([]),
  plannedStartAt: z.string().optional().nullable(),
  plannedEndAt: z.string().optional().nullable(),
  deadlineAt: z.string().optional().nullable(),
  estimatedHours: z.coerce.number().nonnegative().optional().default(0),
  progressPercent: z.coerce.number().int().min(0).max(100).optional().default(0),
  priority: z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
  steps: z.array(z.object({
    id: z.string().uuid().optional(),
    title: z.string().min(2),
    description: z.string().optional().default(""),
    estimatedHours: z.coerce.number().nonnegative().optional().default(0),
    weightPercent: z.coerce.number().int().min(0).max(100),
    progressPercent: z.coerce.number().int().min(0).max(100).optional().default(0),
    sortOrder: z.coerce.number().int().optional()
  })).optional().default([])
});

export const TaskStepInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(2),
  description: z.string().optional().default(""),
  estimatedHours: z.coerce.number().nonnegative().optional().default(0),
  weightPercent: z.coerce.number().int().min(0).max(100),
  progressPercent: z.coerce.number().int().min(0).max(100).optional().default(0),
  sortOrder: z.coerce.number().int().optional()
});

export const CreateAdminUserSchema = z.object({
  username: z.string().min(2),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  locale: z.enum(["en", "es"]).default("en"),
  role: GlobalRoleSchema
});

export const CreateFirstAdminSchema = CreateAdminUserSchema.omit({ role: true }).extend({
  role: z.literal("admin").optional().default("admin")
});

export const UpdateAdminUserSchema = z.object({
  username: z.string().min(2).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional().or(z.literal("")),
  locale: z.enum(["en", "es"]).optional(),
  role: GlobalRoleSchema.optional()
});

export const CreateMilestoneSchema = z.object({
  name: z.string().min(3),
  description: z.string().optional().default(""),
  plannedStartAt: z.string().optional().nullable(),
  plannedEndAt: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().optional().default(0)
});

export const UpdateMilestoneSchema = CreateMilestoneSchema.partial().extend({
  isActive: z.boolean().optional()
});

export const LinkMilestoneFileSchema = z.object({
  vaultItemId: z.string().uuid()
});

export const UpdateTaskScheduleSchema = z.object({
  plannedStartAt: z.string(),
  plannedEndAt: z.string(),
  estimatedHours: z.coerce.number().nonnegative().optional()
});

export const UpdateTaskOrderSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1)
});

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  const allowed: Record<TaskStatus, TaskStatus[]> = {
    planned: ["should_start", "in_progress", "paused", "done", "cancelled"],
    should_start: ["planned", "in_progress", "paused", "blocked", "done", "cancelled"],
    in_progress: ["planned", "paused", "blocked", "in_review", "done", "cancelled"],
    paused: ["planned", "in_progress", "done", "cancelled"],
    blocked: ["planned", "in_progress", "paused", "done", "cancelled"],
    in_review: ["planned", "in_progress", "done", "rejected", "cancelled"],
    done: ["planned", "in_progress", "accepted", "rejected"],
    accepted: [],
    rejected: ["planned", "in_progress", "cancelled"],
    cancelled: ["planned"]
  };

  return allowed[from].includes(to);
}

export function calculateProjectHours(input: {
  budgetedHours: number;
  estimatedHours: number;
  actualHours: number;
}) {
  const remainingHours = input.budgetedHours - input.actualHours;
  const projectedHours = input.actualHours + input.estimatedHours;
  const projectedDeviation = projectedHours - input.budgetedHours;

  return {
    remainingHours,
    projectedHours,
    projectedDeviation,
    usagePercent: input.budgetedHours === 0 ? 0 : Math.round((input.actualHours / input.budgetedHours) * 100)
  };
}

export function calculateTaskProgressFromSteps(input: {
  steps: Array<{ progressPercent: number; weightPercent: number; estimatedHours?: number }>;
}) {
  const steps = input.steps;
  const estimatedHours = steps.reduce((sum, step) => sum + Math.max(0, Number(step.estimatedHours ?? 0)), 0);
  const progressPercent = steps.length === 0
    ? 0
    : Math.round(
        steps.reduce((sum, step) => {
          const progress = Math.max(0, Math.min(100, Number(step.progressPercent ?? 0)));
          const weight = Math.max(0, Math.min(100, Number(step.weightPercent ?? 0)));
          return sum + progress * (weight / 100);
        }, 0)
      );

  return {
    estimatedHours,
    progressPercent: Math.max(0, Math.min(100, progressPercent))
  };
}

export function calculateMilestoneProgress(input: {
  tasks: Array<{ progressPercent: number; estimatedHours: number }>;
  plannedStartAt?: string | Date | null;
  plannedEndAt?: string | Date | null;
  now?: string | Date;
}) {
  const activeTasks = input.tasks;
  const totalHours = activeTasks.reduce((sum, task) => sum + Math.max(0, task.estimatedHours), 0);
  const progressPercent = activeTasks.length === 0
    ? 0
    : totalHours > 0
      ? Math.round(activeTasks.reduce((sum, task) => sum + task.progressPercent * Math.max(0, task.estimatedHours), 0) / totalHours)
      : Math.round(activeTasks.reduce((sum, task) => sum + task.progressPercent, 0) / activeTasks.length);

  const start = input.plannedStartAt ? new Date(input.plannedStartAt) : null;
  const end = input.plannedEndAt ? new Date(input.plannedEndAt) : null;
  const now = input.now ? new Date(input.now) : new Date();
  let timeProgressPercent = 0;

  if (start && end && Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())) {
    if (now <= start) {
      timeProgressPercent = 0;
    } else if (now >= end) {
      timeProgressPercent = 100;
    } else {
      const duration = Math.max(1, end.getTime() - start.getTime());
      timeProgressPercent = Math.round(((now.getTime() - start.getTime()) / duration) * 100);
    }
  }

  return {
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
    timeProgressPercent: Math.max(0, Math.min(100, timeProgressPercent))
  };
}
