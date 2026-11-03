export interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
  locale?: string;
  primaryRole: string;
  isExternal: boolean;
  deletedAt?: string | null;
}

export interface Company {
  id: string;
  name: string;
  type: string;
}

export interface ProjectMember {
  id: string;
  projectRole: string;
  user: User;
}

export interface TaskCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface TaskComment {
  id: string;
  body: string;
  visibility: string;
  createdAt: string;
  author: User;
}

export interface TaskFileLink {
  id: string;
  taskId: string;
  vaultItemId: string;
  relationType: string;
  createdAt: string;
  vaultItem: VaultItem;
}

export interface TaskStep {
  id: string;
  taskId: string;
  title: string;
  description: string;
  sortOrder: number;
  estimatedHours: string | number;
  weightPercent: number;
  progressPercent: number;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  description: string;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  resolvedStartAt?: string | null;
  resolvedEndAt?: string | null;
  sortOrder: number;
  isActive: boolean;
  progressPercent?: number;
  timeProgressPercent?: number;
  tasks?: Task[];
  documents?: VaultItem[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  estimatedHours: string | number;
  actualHours: string | number;
  progressPercent: number;
  steps?: TaskStep[];
  qualityRating?: number | null;
  feedbackStatus?: string | null;
  feedbackNotes?: string | null;
  milestone?: Milestone | null;
  category?: TaskCategory | null;
  assignments: Array<{ id: string; user: User; assignmentRole: string }>;
  comments?: TaskComment[];
  files?: TaskFileLink[];
}

export interface VaultItem {
  id: string;
  itemType: "folder" | "file";
  name: string;
  parentId?: string | null;
  mimeType?: string | null;
  sizeBytes?: string | null;
  createdAt: string;
  updatedAt: string;
  taskLinks?: Array<{ id: string; taskId: string }>;
}

export interface Project {
  id: string;
  name: string;
  manufacturingOrder: string;
  description: string;
  status: string;
  color: string;
  budgetedHours: string | number;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  clientCompany?: Company | null;
  members: ProjectMember[];
  milestones?: Milestone[];
  categories?: TaskCategory[];
  tasks: Task[];
  vaultItems?: VaultItem[];
  health: {
    budgetedHours: number;
    estimatedHours: number;
    actualHours: number;
    remainingHours: number;
    projectedHours: number;
    usagePercent: number;
    tasksTotal: number;
    tasksDone: number;
    tasksBlocked: number;
  };
}

export interface WorkloadTask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  estimatedHours: string | number;
  actualHours: string | number;
  progressPercent: number;
  steps?: TaskStep[];
  project: Pick<Project, "id" | "name" | "manufacturingOrder" | "color" | "clientCompany">;
  category?: TaskCategory | null;
  milestone?: Pick<Milestone, "id" | "name"> | null;
}

export interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actor?: User | null;
}
