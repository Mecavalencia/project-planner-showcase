"use client";

import type React from "react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Columns3,
  Download,
  FileText,
  FileUp,
  Flag,
  FolderOpen,
  FolderPlus,
  GanttChartSquare,
  Info,
  List,
  ListChecks,
  LogOut,
  MessageSquare,
  MoreVertical,
  MoveRight,
  Eye,
  EyeOff,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users
} from "lucide-react";
import { apiFetch, publicApiFetch } from "@/lib/api";
import type { AuditEvent, Project, Task, User, VaultItem } from "@/lib/types";
import { formatDate, formatHours } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { TaskStatusBadge } from "@/components/status";
import { GanttPanel } from "@/components/gantt-panel";
import { AdminPanel } from "@/components/admin-panel";
import { MilestonesPanel } from "@/components/milestones-panel";

type Tab = "resumen" | "tareas" | "hitos" | "gantt" | "vault" | "miembros" | "auditoria";
type AppArea = "projects" | "admin";
type TaskFilter = "all" | "not_started" | "paused" | "closed";
type TaskViewMode = "list" | "board";
type BoardColumnId = "not_started" | "in_progress" | "paused" | "closed";
type TaskStepDraft = {
  id?: string;
  title: string;
  description: string;
  estimatedHours: number;
  weightPercent: number;
  progressPercent: number;
  sortOrder: number;
};
type SetupStatus = { needsFirstAdmin: boolean };

const taskBoardColumns: Array<{ id: BoardColumnId; title: string; statuses: string[] }> = [
  { id: "not_started", title: "Not started", statuses: ["planned", "should_start"] },
  { id: "in_progress", title: "In progress", statuses: ["in_progress", "blocked", "in_review", "rejected"] },
  { id: "paused", title: "Paused", statuses: ["paused"] },
  { id: "closed", title: "Completed", statuses: ["done", "accepted"] }
];

export function PlannerApp() {
  const { data: session, status } = useSession();
  const accessToken = session?.accessToken;
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [tab, setTab] = useState<Tab>("resumen");
  const [area, setArea] = useState<AppArea>("projects");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [hiddenProjectIds, setHiddenProjectIds] = useState<string[]>([]);
  const isAdmin = session?.user.roles?.includes("admin") ?? false;

  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) ?? projects[0], [projects, selectedProjectId]);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const [projectList, userList] = await Promise.all([
        apiFetch<Project[]>("/projects", accessToken),
        apiFetch<User[]>("/users", accessToken)
      ]);
      setProjects(projectList);
      setUsers(userList);
      if (!selectedProjectId && projectList[0]) setSelectedProjectId(projectList[0].id);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the information");
    } finally {
      setLoading(false);
    }
  }, [accessToken, selectedProjectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (session) {
      setSetupLoading(false);
      return;
    }
    let cancelled = false;
    setSetupLoading(true);
    publicApiFetch<SetupStatus>("/admin/setup")
      .then((status) => {
        if (!cancelled) setSetupStatus(status);
      })
      .catch(() => {
        if (!cancelled) setSetupStatus(null);
      })
      .finally(() => {
        if (!cancelled) setSetupLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("planner.hiddenProjectIds");
      if (stored) setHiddenProjectIds(JSON.parse(stored));
    } catch {
      setHiddenProjectIds([]);
    }
  }, []);

  const toggleProjectHidden = useCallback((projectId: string) => {
    setHiddenProjectIds((current) => {
      const next = current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId];
      window.localStorage.setItem("planner.hiddenProjectIds", JSON.stringify(next));
      return next;
    });
  }, []);

  const reloadProject = useCallback(async () => {
    if (!accessToken || !selectedProject) return;
    const project = await apiFetch<Project>(`/projects/${selectedProject.id}`, accessToken);
    setProjects((current) => current.map((item) => (item.id === project.id ? project : item)));
  }, [accessToken, selectedProject]);

  if (status === "loading") {
    return <FullScreenMessage title="Loading session" description="Preparing your planning workspace." />;
  }

  if (session?.error === "RefreshAccessTokenError") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Badge className="w-fit" variant="outline">
              Keycloak
            </Badge>
            <CardTitle className="text-2xl">Session expired</CardTitle>
            <CardDescription>Sign in again to renew your session.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => signIn("keycloak", undefined, { prompt: "login" })}>
              <ShieldCheck data-icon="inline-start" />
              Sign in again with Keycloak
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!session) {
    if (setupLoading) {
      return <FullScreenMessage title="Checking setup" description="Checking whether this instance has an administrator." />;
    }
    if (setupStatus?.needsFirstAdmin) {
      return (
        <FirstAdminSetup
          onCreated={async () => {
            setSetupStatus({ needsFirstAdmin: false });
          }}
        />
      );
    }
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Badge className="w-fit" variant="outline">
              Keycloak
            </Badge>
            <CardTitle className="text-2xl">Project Planner</CardTitle>
            <CardDescription>Sign in with your organization account to manage projects, tasks, Gantt schedules, and files.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Button onClick={() => signIn("keycloak", undefined, { prompt: "login" })}>
              <ShieldCheck data-icon="inline-start" />
              Sign in with Keycloak
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="border-r border-border bg-background/80 p-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Project management</p>
              <h1 className="text-xl font-semibold">Planner</h1>
            </div>
            <Button variant="ghost" size="icon" onClick={() => signOut({ callbackUrl: "/" })}>
              <LogOut data-icon="inline-start" />
            </Button>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <Button variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw data-icon="inline-start" />
              Refresh
            </Button>
            {isAdmin ? (
              <Button variant={area === "admin" ? "default" : "outline"} onClick={() => setArea("admin")}>
                <ShieldCheck data-icon="inline-start" />
                Admin
              </Button>
            ) : null}
            <CreateProjectForm accessToken={accessToken!} onCreated={refresh} />
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Projects</p>
            {projects.map((project) => {
              const hidden = hiddenProjectIds.includes(project.id);
              return (
                <div
                  key={project.id}
                  className={`grid grid-cols-[1fr_auto] items-stretch rounded-lg border transition ${
                    selectedProject?.id === project.id ? "border-primary bg-primary/8" : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <button
                    className="min-w-0 px-3 py-3 text-left"
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      setArea("projects");
                    }}
                  >
                    <span className="block truncate text-sm font-medium">{hidden ? maskText(project.name) : project.name}</span>
                    {project.manufacturingOrder ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {hidden ? maskText(`Work order: ${project.manufacturingOrder}`) : `Work order: ${project.manufacturingOrder}`}
                      </span>
                    ) : null}
                    <span className="block truncate text-xs text-muted-foreground">{hidden ? maskText(project.clientCompany?.name ?? "No client") : project.clientCompany?.name ?? "No client"}</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-11 items-center justify-center rounded-r-lg border-l border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={hidden ? "Show project" : "Hide project"}
                    aria-label={hidden ? "Show project" : "Hide project"}
                    onClick={() => toggleProjectHidden(project.id)}
                  >
                    {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="p-4 lg:p-6">
          {message ? <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{message}</div> : null}
          {area === "admin" && isAdmin ? (
            <AdminPanel accessToken={accessToken!} users={users} projects={projects} onUsersChanged={refresh} />
          ) : selectedProject ? (
            <ProjectWorkspace
              project={selectedProject}
              users={users}
              accessToken={accessToken!}
              tab={tab}
              setTab={setTab}
              onChanged={reloadProject}
            />
          ) : (
            <EmptyWorkspace />
          )}
        </section>
      </div>
    </main>
  );
}

function ProjectWorkspace({
  project,
  users,
  accessToken,
  tab,
  setTab,
  onChanged
}: {
  project: Project;
  users: User[];
  accessToken: string;
  tab: Tab;
  setTab: (tab: Tab) => void;
  onChanged: () => void;
}) {
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "resumen", label: "Overview", icon: <Archive data-icon="inline-start" /> },
    { id: "tareas", label: "Tasks", icon: <CheckCircle2 data-icon="inline-start" /> },
    { id: "hitos", label: "Milestones", icon: <Flag data-icon="inline-start" /> },
    { id: "gantt", label: "Gantt", icon: <GanttChartSquare data-icon="inline-start" /> },
    { id: "vault", label: "Vault", icon: <FileUp data-icon="inline-start" /> },
    { id: "miembros", label: "Members", icon: <Users data-icon="inline-start" /> },
    { id: "auditoria", label: "Audit", icon: <ShieldCheck data-icon="inline-start" /> }
  ];

  async function updateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await apiFetch(`/projects/${project.id}`, accessToken, {
      method: "PATCH",
      body: JSON.stringify({
        name: data.get("name"),
        manufacturingOrder: data.get("manufacturingOrder"),
        description: data.get("description"),
        budgetedHours: Number(data.get("budgetedHours") || 0)
      })
    });
    setEditProjectOpen(false);
    await onChanged();
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4 rounded-xl border border-border bg-background/85 p-5 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{project.status}</Badge>
              <Badge>{project.clientCompany?.name ?? "No client"}</Badge>
              {project.manufacturingOrder ? <Badge variant="secondary">Work order: {project.manufacturingOrder}</Badge> : null}
            </div>
            <h2 className="mt-3 text-2xl font-semibold">{project.name}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{project.description || "No description"}</p>
          </div>
          <div className="grid min-w-64 grid-cols-2 gap-3 text-sm">
            <Metric label="Actual hours" value={formatHours(project.health.actualHours)} />
            <Metric label="Budget" value={formatHours(project.health.budgetedHours)} />
            <Metric label="Start" value={formatDate(project.plannedStartDate)} />
            <Metric label="Target end" value={formatDate(project.plannedEndDate)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={editProjectOpen ? "secondary" : "outline"} size="sm" onClick={() => setEditProjectOpen((value) => !value)}>
            <Pencil data-icon="inline-start" />
            Details
          </Button>
          {tabs.map((item) => (
            <Button key={item.id} variant={tab === item.id ? "default" : "outline"} size="sm" onClick={() => setTab(item.id)}>
              {item.icon}
              {item.label}
            </Button>
          ))}
        </div>
        {editProjectOpen ? (
          <form className="grid gap-3 rounded-lg border border-border bg-muted/35 p-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={updateProject}>
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input name="name" defaultValue={project.name} required />
            </Field>
            <Field>
              <FieldLabel>Work order / order no.</FieldLabel>
              <Input name="manufacturingOrder" defaultValue={project.manufacturingOrder ?? ""} placeholder="WO-2026-001" />
            </Field>
            <Field>
              <FieldLabel>Available hours</FieldLabel>
              <Input name="budgetedHours" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={Number(project.budgetedHours ?? 0)} />
            </Field>
            <Field className="md:col-span-2 xl:col-span-4">
              <FieldLabel>Description</FieldLabel>
              <Textarea name="description" defaultValue={project.description} />
            </Field>
            <div className="flex gap-2 md:col-span-2 xl:col-span-4">
              <Button type="submit" size="sm">Save details</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditProjectOpen(false)}>Cancel</Button>
            </div>
          </form>
        ) : null}
      </header>

      {tab === "resumen" ? <Summary project={project} /> : null}
      {tab === "tareas" ? <TasksView project={project} users={users} accessToken={accessToken} onChanged={onChanged} /> : null}
      {tab === "hitos" ? <MilestonesPanel project={project} accessToken={accessToken} onChanged={onChanged} /> : null}
      {tab === "gantt" ? <GanttPanel projectId={project.id} accessToken={accessToken} onChanged={onChanged} /> : null}
      {tab === "vault" ? <VaultExplorer project={project} accessToken={accessToken} onChanged={onChanged} /> : null}
      {tab === "miembros" ? <MembersView project={project} users={users} accessToken={accessToken} onChanged={onChanged} /> : null}
      {tab === "auditoria" ? <AuditView projectId={project.id} accessToken={accessToken} /> : null}
    </div>
  );
}

function Summary({ project }: { project: Project }) {
  const donePercent = project.health.tasksTotal === 0 ? 0 : Math.round((project.health.tasksDone / project.health.tasksTotal) * 100);
  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>Project health</CardTitle>
          <CardDescription>
            {project.manufacturingOrder ? `Work order / order no.: ${project.manufacturingOrder}. ` : ""}
            Track hours, blocked tasks, and actual progress.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <HealthBlock label="Hours used" value={`${project.health.usagePercent}%`} tone={project.health.usagePercent > 90 ? "danger" : "normal"} />
          <HealthBlock label="Forecast" value={formatHours(project.health.projectedHours)} tone={project.health.projectedHours > project.health.budgetedHours ? "danger" : "normal"} />
          <HealthBlock label="Blocked" value={String(project.health.tasksBlocked)} tone={project.health.tasksBlocked > 0 ? "danger" : "normal"} />
          <div className="col-span-full">
            <div className="mb-2 flex justify-between text-sm">
              <span>Task progress</span>
              <span>{donePercent}%</span>
            </div>
            <Progress value={donePercent} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Immediate activity</CardTitle>
          <CardDescription>Tasks that need the project manager’s attention.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {project.tasks.slice(0, 4).map((task) => (
            <div key={task.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium">{task.title}</p>
                <p className="text-xs text-muted-foreground">{formatDate(task.plannedStartAt)} - {formatHours(task.estimatedHours)}</p>
              </div>
              <TaskStatusBadge status={task.status} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function TasksView({ project, users, accessToken, onChanged }: { project: Project; users: User[]; accessToken: string; onChanged: () => void }) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(project.tasks[0] ?? null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [viewMode, setViewMode] = useState<TaskViewMode>("list");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const filteredTasks = useMemo(() => project.tasks.filter((task) => taskMatchesFilter(task, taskFilter)), [project.tasks, taskFilter]);
  useEffect(() => {
    setSelectedTask((current) => project.tasks.find((task) => task.id === current?.id) ?? project.tasks[0] ?? null);
  }, [project.tasks]);

  async function toggleTaskRunState(task: Task) {
    if (task.status === "in_progress") {
      await apiFetch(`/tasks/${task.id}/pause`, accessToken, { method: "POST" });
      await onChanged();
      return;
    }
    await apiFetch(`/tasks/${task.id}/start`, accessToken, { method: "POST" });
    await onChanged();
  }

  async function finishTask(task: Task) {
    await apiFetch(`/tasks/${task.id}/finish`, accessToken, { method: "POST", body: JSON.stringify({ actualHours: Number(task.estimatedHours), qualityRating: 4 }) });
    await onChanged();
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`Delete task "${task.title}"? Its Vault documents will remain.`)) return;
    await apiFetch(`/tasks/${task.id}`, accessToken, { method: "DELETE" });
    setSelectedTask((current) => (current?.id === task.id ? null : current));
    await onChanged();
  }

  async function moveTaskToColumn(task: Task, columnId: BoardColumnId) {
    if (columnId === "not_started") {
      if (task.status === "planned" || task.status === "should_start") return;
      await apiFetch(`/tasks/${task.id}`, accessToken, { method: "PATCH", body: JSON.stringify({ status: "planned", progressPercent: 0 }) });
      await onChanged();
      return;
    }
    if (columnId === "in_progress") {
      if (task.status === "in_progress") return;
      await apiFetch(`/tasks/${task.id}/start`, accessToken, { method: "POST" });
      await onChanged();
      return;
    }
    if (columnId === "paused") {
      if (task.status === "paused") return;
      if (task.status !== "in_progress") await apiFetch(`/tasks/${task.id}/start`, accessToken, { method: "POST" });
      await apiFetch(`/tasks/${task.id}/pause`, accessToken, { method: "POST" });
      await onChanged();
      return;
    }
    if (columnId === "closed") {
      if (["done", "accepted"].includes(task.status)) return;
      if (!["in_progress", "blocked", "in_review"].includes(task.status)) {
        await apiFetch(`/tasks/${task.id}/start`, accessToken, { method: "POST" });
      }
      await apiFetch(`/tasks/${task.id}/finish`, accessToken, { method: "POST", body: JSON.stringify({ actualHours: Number(task.actualHours || task.estimatedHours || 0), qualityRating: 4 }) });
      await onChanged();
    }
  }

  async function dropTaskOnColumn(columnId: BoardColumnId) {
    const task = project.tasks.find((item) => item.id === draggedTaskId);
    setDraggedTaskId(null);
    if (!task) return;
    try {
      await moveTaskToColumn(task, columnId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not move the task");
    }
  }

  return (
    <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
      <Card className="order-2 min-w-0 2xl:order-1">
        <CardHeader className="flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Tasks</CardTitle>
            <CardDescription>Plan, run, and track work.</CardDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              <TooltipIconButton label="All tasks" active={taskFilter === "all"} onClick={() => setTaskFilter("all")}>
                <List className="size-4" />
              </TooltipIconButton>
              <TooltipIconButton label="Not started" active={taskFilter === "not_started"} onClick={() => setTaskFilter("not_started")}>
                <Play className="size-4" />
              </TooltipIconButton>
              <TooltipIconButton label="Paused" active={taskFilter === "paused"} onClick={() => setTaskFilter("paused")}>
                <Pause className="size-4" />
              </TooltipIconButton>
              <TooltipIconButton label="Closed" active={taskFilter === "closed"} onClick={() => setTaskFilter("closed")}>
                <CheckCircle2 className="size-4" />
              </TooltipIconButton>
              <span className="mx-1 h-8 w-px bg-border" />
              <TooltipIconButton label="List view" active={viewMode === "list"} onClick={() => setViewMode("list")}>
                <List className="size-4" />
              </TooltipIconButton>
              <TooltipIconButton label="Board view" active={viewMode === "board"} onClick={() => setViewMode("board")}>
                <Columns3 className="size-4" />
              </TooltipIconButton>
            </div>
          </div>
          <CreateTaskForm project={project} users={users} accessToken={accessToken} onCreated={onChanged} />
        </CardHeader>
        {viewMode === "list" ? (
        <CardContent className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="border-b border-border p-3">Task</th>
                <th className="border-b border-border p-3">Category</th>
                <th className="border-b border-border p-3">Assignees</th>
                <th className="border-b border-border p-3">Milestone</th>
                <th className="border-b border-border p-3">Dates</th>
                <th className="border-b border-border p-3">Hours</th>
                <th className="border-b border-border p-3">Progress</th>
                <th className="border-b border-border p-3">Status</th>
                <th className="border-b border-border p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => (
                <tr key={task.id} className="hover:bg-muted/50">
                  <td className="border-b border-border p-3">
                    <button className="text-left font-medium text-foreground" onClick={() => setSelectedTask(task)}>
                      {task.title}
                    </button>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{task.description}</p>
                  </td>
                  <td className="border-b border-border p-3">{task.category?.name ?? "No category"}</td>
                  <td className="border-b border-border p-3">{formatAssignedUsers(task)}</td>
                  <td className="border-b border-border p-3">{task.milestone?.name ?? "No milestone"}</td>
                  <td className="border-b border-border p-3">{formatDate(task.plannedStartAt)} - {formatDate(task.plannedEndAt)}</td>
                  <td className="border-b border-border p-3">{formatHours(task.actualHours)} / {formatHours(task.estimatedHours)}</td>
                  <td className="border-b border-border p-3">{task.progressPercent}%</td>
                  <td className="border-b border-border p-3"><TaskStatusBadge status={task.status} /></td>
                  <td className="border-b border-border p-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => toggleTaskRunState(task)} disabled={!["planned", "should_start", "in_progress", "paused"].includes(task.status)}>
                        {task.status === "in_progress" ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                        {task.status === "in_progress" ? "Pause" : task.status === "paused" ? "Resume" : "Start"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => finishTask(task)} disabled={!["in_progress", "blocked", "in_review"].includes(task.status)}>
                        <CheckCircle2 data-icon="inline-start" />
                        Close
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => deleteTask(task)}>
                        <Trash2 data-icon="inline-start" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
        ) : (
          <CardContent>
            <TaskBoard
              tasks={filteredTasks}
              selectedTaskId={selectedTask?.id}
              draggedTaskId={draggedTaskId}
              setDraggedTaskId={setDraggedTaskId}
              onSelectTask={setSelectedTask}
              onDropTask={dropTaskOnColumn}
            />
          </CardContent>
        )}
      </Card>
      <div className="order-1 min-w-0 2xl:order-2 2xl:sticky 2xl:top-4 2xl:self-start">
        <TaskDetail task={selectedTask} project={project} users={users} accessToken={accessToken} onChanged={onChanged} />
      </div>
    </div>
  );
}

function TooltipIconButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex">
      <Button type="button" size="icon" variant={active ? "default" : "outline"} aria-label={label} title={label} onClick={onClick}>
        {children}
      </Button>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-foreground px-2 py-1 text-xs text-background shadow-soft group-hover:block">
        {label}
      </span>
    </span>
  );
}

function TaskBoard({
  tasks,
  selectedTaskId,
  draggedTaskId,
  setDraggedTaskId,
  onSelectTask,
  onDropTask
}: {
  tasks: Task[];
  selectedTaskId?: string;
  draggedTaskId: string | null;
  setDraggedTaskId: (taskId: string | null) => void;
  onSelectTask: (task: Task) => void;
  onDropTask: (columnId: BoardColumnId) => void;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-4">
      {taskBoardColumns.map((column) => {
        const columnTasks = tasks.filter((task) => column.statuses.includes(task.status));
        const isDropActive = draggedTaskId !== null;
        return (
          <section
            key={column.id}
            className={`min-h-80 rounded-lg border border-border bg-muted/30 p-3 transition-colors ${isDropActive ? "border-primary/50 bg-primary/5" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => onDropTask(column.id)}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{column.title}</h3>
              <Badge variant="outline">{columnTasks.length}</Badge>
            </div>
            <div className="flex flex-col gap-3">
              {columnTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  draggable
                  onDragStart={() => setDraggedTaskId(task.id)}
                  onDragEnd={() => setDraggedTaskId(null)}
                  onClick={() => onSelectTask(task)}
                  className={`rounded-md border p-3 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-md ${
                    selectedTaskId === task.id ? "border-primary bg-primary/10" : "border-border bg-background"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-semibold">{task.title}</p>
                    <TaskStatusBadge status={task.status} />
                  </div>
                  {task.description ? <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{task.description}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">{task.progressPercent}%</Badge>
                    {task.milestone?.name ? <Badge variant="outline">{task.milestone.name}</Badge> : null}
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    <p>{formatDate(task.plannedStartAt)} - {formatDate(task.plannedEndAt)}</p>
                    <p className="mt-1 line-clamp-1">{formatAssignedUsers(task)}</p>
                  </div>
                </button>
              ))}
              {columnTasks.length === 0 ? <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">Drag tasks here</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TaskDetail({ task, project, users, accessToken, onChanged }: { task: Task | null; project: Project; users: User[]; accessToken: string; onChanged: () => void }) {
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState(false);
  const [taskFileMessage, setTaskFileMessage] = useState("");
  const [taskFileBusy, setTaskFileBusy] = useState(false);
  const [stepDrafts, setStepDrafts] = useState<TaskStepDraft[]>([]);
  useEffect(() => {
    setEditing(false);
    setComment("");
    setTaskFileMessage("");
    setTaskFileBusy(false);
    setStepDrafts(stepsFromTask(task));
  }, [task]);
  if (!task) return <Card className="min-w-0"><CardHeader><CardTitle>Details</CardTitle><CardDescription>Select a task.</CardDescription></CardHeader></Card>;

  const currentTask = task;
  const stepWeightTotal = stepDrafts.reduce((sum, step) => sum + Number(step.weightPercent || 0), 0);
  const persistedSteps = currentTask.steps ?? [];
  const hasStepPlan = stepDrafts.length > 0;
  const taskFiles = currentTask.files ?? [];
  const linkedVaultItemIds = new Set(taskFiles.map((file) => file.vaultItemId));
  const availableVaultFiles = (project.vaultItems ?? []).filter((item) => item.itemType === "file" && !linkedVaultItemIds.has(item.id));
  const folders = (project.vaultItems ?? []).filter((item) => item.itemType === "folder");

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim()) return;
    await apiFetch(`/tasks/${currentTask.id}/comments`, accessToken, { method: "POST", body: JSON.stringify({ body: comment, visibility: "project" }) });
    setComment("");
    await onChanged();
  }

  async function updateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await apiFetch(`/tasks/${currentTask.id}`, accessToken, {
      method: "PATCH",
      body: JSON.stringify({
        title: data.get("title"),
        description: data.get("description"),
        milestoneId: data.get("milestoneId") || null,
        categoryId: data.get("categoryId") || null,
        responsibleUserIds: data.getAll("responsibleUserIds"),
        priority: data.get("priority"),
        plannedStartAt: data.get("plannedStartAt") ? `${data.get("plannedStartAt")}T08:00:00.000Z` : null,
        plannedEndAt: data.get("plannedEndAt") ? `${data.get("plannedEndAt")}T16:00:00.000Z` : null,
        estimatedHours: Number(data.get("estimatedHours") || 0),
        actualHours: Number(data.get("actualHours") || 0),
        progressPercent: Number(data.get("progressPercent") || 0),
        steps: buildTaskStepsPayload(stepDrafts),
        qualityRating: data.get("qualityRating") ? Number(data.get("qualityRating")) : null,
        feedbackNotes: data.get("feedbackNotes")
      })
    });
    setEditing(false);
    await onChanged();
  }

  async function uploadTaskFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!data.get("file")) return;
    data.append("taskId", currentTask.id);
    setTaskFileBusy(true);
    setTaskFileMessage("");
    try {
      await apiFetch(`/projects/${project.id}/vault/files`, accessToken, { method: "POST", body: data });
      form.reset();
      setTaskFileMessage("File uploaded to the Vault and linked to the task.");
      await onChanged();
    } finally {
      setTaskFileBusy(false);
    }
  }

  async function linkExistingTaskFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const vaultItemId = data.get("vaultItemId");
    if (!vaultItemId) return;
    setTaskFileBusy(true);
    setTaskFileMessage("");
    try {
      await apiFetch(`/tasks/${currentTask.id}/files`, accessToken, { method: "POST", body: JSON.stringify({ vaultItemId }) });
      setTaskFileMessage("File linked to the task.");
      await onChanged();
    } finally {
      setTaskFileBusy(false);
    }
  }

  async function unlinkTaskFile(vaultItemId: string) {
    setTaskFileBusy(true);
    setTaskFileMessage("");
    try {
      await apiFetch(`/tasks/${currentTask.id}/files/${vaultItemId}`, accessToken, { method: "DELETE" });
      setTaskFileMessage("File unlinked from the task.");
      await onChanged();
    } finally {
      setTaskFileBusy(false);
    }
  }

  async function downloadTaskFile(item: VaultItem) {
    const { url } = await apiFetch<{ url: string }>(`/vault/items/${item.id}/download`, accessToken);
    window.open(url, "_blank");
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{task.title}</CardTitle>
            <CardDescription>{task.description || "No description"}</CardDescription>
          </div>
          <Button size="sm" variant={editing ? "secondary" : "outline"} onClick={() => setEditing((value) => !value)}>
            <Pencil data-icon="inline-start" />
            {editing ? "Close editor" : "Edit"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-md border border-border bg-muted/35 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Task progress</p>
              <p className="text-xs text-muted-foreground">
                {persistedSteps.length > 0 ? "Calculated from the configured steps." : "Manual task progress."}
              </p>
            </div>
            <Badge variant="outline">{task.progressPercent}%</Badge>
          </div>
          <Progress value={task.progressPercent ?? 0} />
        </div>
        {editing ? (
          <form className="flex flex-col gap-4" onSubmit={updateTask}>
            <section className="grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <p className="mb-2 text-sm font-medium">Main details</p>
              </div>
              <Field className="md:col-span-2">
                <FieldLabel>Name</FieldLabel>
                <Input name="title" defaultValue={task.title} required />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel>Description</FieldLabel>
                <Textarea name="description" defaultValue={task.description} />
              </Field>
              <Field>
                <FieldLabel>Milestone</FieldLabel>
                <select name="milestoneId" className="h-10 rounded-md border border-border bg-background px-3 text-sm" defaultValue={task.milestone?.id ?? ""}>
                  <option value="">No milestone</option>
                  {(project.milestones ?? []).map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.name}</option>)}
                </select>
              </Field>
              <Field>
                <FieldLabel>Category</FieldLabel>
                <select name="categoryId" className="h-10 rounded-md border border-border bg-background px-3 text-sm" defaultValue={task.category?.id ?? ""}>
                  <option value="">No category</option>
                  {(project.categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </Field>
              <Field>
                <FieldLabel>Priority</FieldLabel>
                <select name="priority" className="h-10 rounded-md border border-border bg-background px-3 text-sm" defaultValue={task.priority}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </Field>
            </section>
            <section className="grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <p className="mb-1 text-sm font-medium">Schedule and progress</p>
                {hasStepPlan ? <p className="text-xs text-muted-foreground">With steps configured, estimated hours and progress are calculated from the step list.</p> : null}
              </div>
              <Field>
                <FieldLabel>Planned start</FieldLabel>
                <Input name="plannedStartAt" type="date" defaultValue={toDateInput(task.plannedStartAt)} />
              </Field>
              <Field>
                <FieldLabel>Planned end</FieldLabel>
                <Input name="plannedEndAt" type="date" defaultValue={toDateInput(task.plannedEndAt)} />
              </Field>
              <Field>
                <FieldLabel>Estimated hours</FieldLabel>
                <Input name="estimatedHours" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={Number(task.estimatedHours ?? 0)} disabled={hasStepPlan} />
              </Field>
              <Field>
                <FieldLabel>Actual hours</FieldLabel>
                <Input name="actualHours" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={Number(task.actualHours ?? 0)} />
              </Field>
              <Field>
                <FieldLabel>Effective progress (%)</FieldLabel>
                <Input name="progressPercent" type="number" min="0" max="100" step="1" defaultValue={task.progressPercent ?? 0} disabled={hasStepPlan} />
              </Field>
              <Field>
                <FieldLabel>Quality rating</FieldLabel>
                <Input name="qualityRating" type="number" min="1" max="5" defaultValue={task.qualityRating ?? ""} />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel>Feedback</FieldLabel>
                <Input name="feedbackNotes" defaultValue={task.feedbackNotes ?? ""} />
              </Field>
            </section>
            <section className="rounded-md border border-border bg-background p-3">
              <TaskStepsEditor steps={stepDrafts} onChange={setStepDrafts} />
              {stepDrafts.length > 0 && stepWeightTotal !== 100 ? (
                <p className="mt-2 rounded-md border border-danger/30 bg-danger/10 p-2 text-xs text-danger">Step weights must add up to 100% before saving.</p>
              ) : null}
            </section>
            <section className="rounded-md border border-border bg-background p-3">
              <Field>
                <FieldLabel>Assignees</FieldLabel>
                <div className="grid max-h-44 gap-2 overflow-y-auto rounded-md border border-border bg-background p-3 sm:grid-cols-2">
                  {users.map((user) => (
                    <label key={user.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="responsibleUserIds"
                        value={user.id}
                        defaultChecked={task.assignments.some((assignment) => assignment.user.id === user.id)}
                      />
                      <span>{user.displayName}</span>
                    </label>
                  ))}
                </div>
              </Field>
            </section>
            <Button type="submit" disabled={stepDrafts.length > 0 && stepWeightTotal !== 100}>
              Save changes
            </Button>
          </form>
        ) : null}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Metric label="Status" value={task.status} />
          <Metric label="Progress" value={`${task.progressPercent}%`} />
          <Metric label="Steps" value={persistedSteps.length > 0 ? `${persistedSteps.length} pasos` : "No steps"} />
          <Metric label="Assignees" value={formatAssignedUsers(task)} />
          <Metric label="Actual start" value={formatDate(task.actualStartAt)} />
          <Metric label="Actual end" value={formatDate(task.actualEndAt)} />
        </div>
        <TaskStepsSummary task={task} />
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <div>
            <p className="text-sm font-medium">Task documents</p>
            <p className="text-xs text-muted-foreground">Upload a file here to save it in the Vault and link it to this task.</p>
          </div>
          {taskFileMessage ? <div className="rounded-md border border-border bg-muted p-2 text-xs text-muted-foreground">{taskFileMessage}</div> : null}
          <form className="grid gap-2" onSubmit={uploadTaskFile}>
            <Input name="file" type="file" required disabled={taskFileBusy} />
            <select name="parentId" className="h-10 rounded-md border border-border bg-background px-3 text-sm" defaultValue="" disabled={taskFileBusy}>
              <option value="">Project root</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
            <Button size="sm" type="submit" disabled={taskFileBusy}>
              <FileUp data-icon="inline-start" />
              Upload and link
            </Button>
          </form>
          {availableVaultFiles.length > 0 ? (
            <form className="grid gap-2" onSubmit={linkExistingTaskFile}>
              <FieldLabel>Link an existing file</FieldLabel>
              <select name="vaultItemId" className="h-10 rounded-md border border-border bg-background px-3 text-sm" disabled={taskFileBusy}>
                {availableVaultFiles.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
              </select>
              <Button size="sm" type="submit" variant="outline" disabled={taskFileBusy}>Link existing file</Button>
            </form>
          ) : null}
          <div className="flex flex-col gap-2">
            {taskFiles.length === 0 ? <p className="text-xs text-muted-foreground">No linked files.</p> : null}
            {taskFiles.map((file) => (
              <div key={file.id} className="flex items-center justify-between gap-2 rounded-md bg-muted p-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{file.vaultItem.name}</p>
                  <p className="text-xs text-muted-foreground">{file.vaultItem.sizeBytes ? `${file.vaultItem.sizeBytes} bytes` : "Vault file"}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" type="button" onClick={() => downloadTaskFile(file.vaultItem)}>
                    <Download data-icon="inline-start" />
                    Open
                  </Button>
                  <Button size="sm" variant="outline" type="button" disabled={taskFileBusy} onClick={() => unlinkTaskFile(file.vaultItemId)}>
                    <Trash2 data-icon="inline-start" />
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <form className="flex flex-col gap-2" onSubmit={addComment}>
          <Field>
            <FieldLabel>Comment</FieldLabel>
            <Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a progress note" />
          </Field>
          <Button size="sm" type="submit">
            <MessageSquare data-icon="inline-start" />
            Add comment
          </Button>
        </form>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Comment history</p>
          {(task.comments ?? []).map((item) => (
            <div key={item.id} className="rounded-md bg-muted p-3 text-sm">
              <p>{item.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.author.displayName} · {formatDate(item.createdAt)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function VaultView({ project, accessToken, onChanged }: { project: Project; accessToken: string; onChanged: () => void }) {
  const [folderName, setFolderName] = useState("");
  const [taskId, setTaskId] = useState("");
  const [vaultMessage, setVaultMessage] = useState("");
  const [vaultBusy, setVaultBusy] = useState(false);
  const vaultItems = project.vaultItems ?? [];

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderName.trim()) return;
    setVaultBusy(true);
    try {
      await apiFetch(`/projects/${project.id}/vault/folders`, accessToken, { method: "POST", body: JSON.stringify({ name: folderName }) });
      setFolderName("");
      setVaultMessage("Folder created.");
      await onChanged();
    } catch (error) {
      setVaultMessage(error instanceof Error ? error.message : "Could not create the folder");
    } finally {
      setVaultBusy(false);
    }
  }

  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("file") as HTMLInputElement;
    if (!input.files?.[0]) {
      setVaultMessage("Select a file before uploading.");
      return;
    }
    const data = new FormData();
    data.append("file", input.files[0]);
    if (taskId) data.append("taskId", taskId);
    setVaultBusy(true);
    try {
      await apiFetch(`/projects/${project.id}/vault/files`, accessToken, { method: "POST", body: data });
      form.reset();
      setTaskId("");
      setVaultMessage("File uploaded.");
      await onChanged();
    } catch (error) {
      setVaultMessage(error instanceof Error ? error.message : "Could not upload the file");
    } finally {
      setVaultBusy(false);
    }
  }

  async function openDownload(item: VaultItem) {
    const { url } = await apiFetch<{ url: string }>(`/vault/items/${item.id}/download`, accessToken);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Vault actions</CardTitle>
          <CardDescription>Organize folders, files, and evidence.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {vaultMessage ? <div className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">{vaultMessage}</div> : null}
          <form className="flex flex-col gap-3" onSubmit={createFolder}>
            <Field>
              <FieldLabel>New folder</FieldLabel>
              <Input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="03_Implementation" />
            </Field>
            <Button type="submit" variant="outline" disabled={vaultBusy}>
              <FolderPlus data-icon="inline-start" />
              Create folder
            </Button>
          </form>
          <form className="flex flex-col gap-3" onSubmit={uploadFile}>
            <Field>
              <FieldLabel>Upload file</FieldLabel>
              <Input name="file" type="file" />
              <FieldDescription>Stored in MinIO and available to link to a task.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Link to task</FieldLabel>
              <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                <option value="">Do not link</option>
                {project.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
            </Field>
            <Button type="submit" disabled={vaultBusy}>
              <FileUp data-icon="inline-start" />
              Upload
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Document Vault</CardTitle>
          <CardDescription>{vaultItems.length} items recorded.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {vaultItems.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge variant={item.itemType === "folder" ? "outline" : "default"}>{item.itemType === "folder" ? "Folder" : "File"}</Badge>
                  <p className="mt-3 text-sm font-medium">{item.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.sizeBytes ? `${item.sizeBytes} bytes` : "Unknown size"}</p>
                </div>
                {item.itemType === "file" ? <Button size="sm" variant="outline" onClick={() => openDownload(item)}>Open</Button> : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function VaultExplorer({ project, accessToken, onChanged }: { project: Project; accessToken: string; onChanged: () => void }) {
  const [folderName, setFolderName] = useState("");
  const [taskId, setTaskId] = useState("");
  const [vaultMessage, setVaultMessage] = useState("");
  const [vaultBusy, setVaultBusy] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [openMenuItemId, setOpenMenuItemId] = useState<string | null>(null);
  const [detailsItem, setDetailsItem] = useState<VaultItem | null>(null);
  const [moveItem, setMoveItem] = useState<VaultItem | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const vaultItems = project.vaultItems ?? [];
  const folders = useMemo(() => vaultItems.filter((item) => item.itemType === "folder"), [vaultItems]);
  const currentFolder = currentFolderId ? folders.find((item) => item.id === currentFolderId) ?? null : null;
  const currentItems = useMemo(() => vaultItems.filter((item) => (item.parentId ?? null) === currentFolderId), [currentFolderId, vaultItems]);
  const folderPath = useMemo(() => buildVaultBreadcrumb(folders, currentFolderId), [currentFolderId, folders]);

  useEffect(() => {
    if (currentFolderId && !currentFolder) setCurrentFolderId(null);
  }, [currentFolder, currentFolderId]);

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderName.trim()) return;
    setVaultBusy(true);
    try {
      await apiFetch(`/projects/${project.id}/vault/folders`, accessToken, {
        method: "POST",
        body: JSON.stringify({ name: folderName, parentId: currentFolderId })
      });
      setFolderName("");
      setVaultMessage(`Folder created in ${currentFolder?.name ?? "the root"}.`);
      await onChanged();
    } catch (error) {
      setVaultMessage(error instanceof Error ? error.message : "Could not create the folder");
    } finally {
      setVaultBusy(false);
    }
  }

  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("file") as HTMLInputElement;
    if (!input.files?.[0]) {
      setVaultMessage("Select a file before uploading.");
      return;
    }
    const data = new FormData();
    data.append("file", input.files[0]);
    if (taskId) data.append("taskId", taskId);
    if (currentFolderId) data.append("parentId", currentFolderId);
    setVaultBusy(true);
    try {
      await apiFetch(`/projects/${project.id}/vault/files`, accessToken, { method: "POST", body: data });
      form.reset();
      setTaskId("");
      setVaultMessage(`File uploaded to ${currentFolder?.name ?? "the root"}.`);
      await onChanged();
    } catch (error) {
      setVaultMessage(error instanceof Error ? error.message : "Could not upload the file");
    } finally {
      setVaultBusy(false);
    }
  }

  async function moveVaultItem(item: VaultItem, parentId: string | null) {
    setVaultBusy(true);
    try {
      await apiFetch(`/vault/items/${item.id}/move`, accessToken, {
        method: "PATCH",
        body: JSON.stringify({ parentId })
      });
      setVaultMessage(`${item.name} moved successfully.`);
      setOpenMenuItemId(null);
      setMoveItem(null);
      await onChanged();
    } catch (error) {
      setVaultMessage(error instanceof Error ? error.message : "Could not move the item");
    } finally {
      setVaultBusy(false);
      setDraggedItemId(null);
    }
  }

  function canDropInto(folder: VaultItem) {
    if (!draggedItemId || folder.itemType !== "folder" || draggedItemId === folder.id) return false;
    const draggedItem = vaultItems.find((item) => item.id === draggedItemId);
    if (!draggedItem) return false;
    return draggedItem.itemType !== "folder" || !isVaultDescendant(folders, folder.id, draggedItem.id);
  }

  async function dropIntoFolder(event: React.DragEvent<HTMLDivElement>, folder: VaultItem) {
    event.preventDefault();
    if (!canDropInto(folder)) return;
    const draggedItem = vaultItems.find((item) => item.id === draggedItemId);
    if (draggedItem) await moveVaultItem(draggedItem, folder.id);
  }

  async function dropIntoRoot(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const draggedItem = vaultItems.find((item) => item.id === draggedItemId);
    if (draggedItem) await moveVaultItem(draggedItem, null);
  }

  async function openDownload(item: VaultItem) {
    const { url } = await apiFetch<{ url: string }>(`/vault/items/${item.id}/download`, accessToken);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Vault actions</CardTitle>
          <CardDescription>Current location: {currentFolder?.name ?? "Project root"}.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {vaultMessage ? <div className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">{vaultMessage}</div> : null}
          <div className="rounded-md border border-border bg-background p-3 text-sm">
            <p className="font-medium">Path</p>
            <div className="mt-2 flex flex-wrap items-center gap-1 text-muted-foreground">
              <button type="button" className="rounded px-2 py-1 hover:bg-muted" onClick={() => setCurrentFolderId(null)}>Root</button>
              {folderPath.map((folder) => (
                <span key={folder.id} className="flex items-center gap-1">
                  <ChevronRight className="size-4" />
                  <button type="button" className="rounded px-2 py-1 hover:bg-muted" onClick={() => setCurrentFolderId(folder.id)}>{folder.name}</button>
                </span>
              ))}
            </div>
            {currentFolder ? (
              <Button className="mt-3" type="button" size="sm" variant="outline" onClick={() => setCurrentFolderId(currentFolder.parentId ?? null)}>
                <ArrowLeft data-icon="inline-start" />
                Up one level
              </Button>
            ) : null}
          </div>
          <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-sm text-muted-foreground" onDragOver={(event) => event.preventDefault()} onDrop={dropIntoRoot}>
            Drop an item here to move it to the root.
          </div>
          <form className="flex flex-col gap-3" onSubmit={createFolder}>
            <Field>
              <FieldLabel>New folder</FieldLabel>
              <Input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="03_Implementation" />
            </Field>
            <Button type="submit" variant="outline" disabled={vaultBusy}>
              <FolderPlus data-icon="inline-start" />
              Create folder
            </Button>
          </form>
          <form className="flex flex-col gap-3" onSubmit={uploadFile}>
            <Field>
              <FieldLabel>Upload file</FieldLabel>
              <Input name="file" type="file" />
              <FieldDescription>Stored in the current folder and available to link to a task.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Link to task</FieldLabel>
              <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                <option value="">Do not link</option>
                {project.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
            </Field>
            <Button type="submit" disabled={vaultBusy}>
              <FileUp data-icon="inline-start" />
              Upload
            </Button>
          </form>
          {detailsItem ? (
            <div className="rounded-md border border-border bg-background p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">Details</p>
                  <p className="mt-1 text-muted-foreground">{detailsItem.name}</p>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDetailsItem(null)}>Close</Button>
              </div>
              <dl className="mt-3 grid gap-2 text-xs">
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Type</dt><dd>{detailsItem.itemType === "folder" ? "Folder" : "File"}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Created</dt><dd>{formatDate(detailsItem.createdAt)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Modified</dt><dd>{formatDate(detailsItem.updatedAt)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Size</dt><dd>{formatVaultSize(detailsItem)}</dd></div>
              </dl>
            </div>
          ) : null}
          {moveItem ? (
            <div className="rounded-md border border-border bg-background p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">Move to</p>
                  <p className="mt-1 text-muted-foreground">{moveItem.name}</p>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => setMoveItem(null)}>Close</Button>
              </div>
              <div className="mt-3 flex flex-col gap-1">
                <Button type="button" size="sm" variant="outline" disabled={vaultBusy} onClick={() => moveVaultItem(moveItem, null)}>
                  <MoveRight data-icon="inline-start" />
                  Project root
                </Button>
                <VaultMoveTree folders={folders} itemToMove={moveItem} onMove={(folderId) => moveVaultItem(moveItem, folderId)} disabled={vaultBusy} />
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Document Vault</CardTitle>
          <CardDescription>{currentItems.length} items in {currentFolder?.name ?? "the root"}.</CardDescription>
        </CardHeader>
        <CardContent>
          {currentItems.length ? (
            <div className="grid gap-3 2xl:grid-cols-2">
              {currentItems.map((item) => (
                <VaultItemCard
                  key={item.id}
                  item={item}
                  menuOpen={openMenuItemId === item.id}
                  canDrop={canDropInto(item)}
                  onOpenFolder={() => setCurrentFolderId(item.id)}
                  onDownload={() => openDownload(item)}
                  onMenuToggle={() => setOpenMenuItemId((value) => (value === item.id ? null : item.id))}
                  onDetails={() => {
                    setDetailsItem(item);
                    setOpenMenuItemId(null);
                  }}
                  onMove={() => {
                    setMoveItem(item);
                    setOpenMenuItemId(null);
                  }}
                  onDragStart={() => setDraggedItemId(item.id)}
                  onDragEnd={() => setDraggedItemId(null)}
                  onDragOver={(event) => {
                    if (canDropInto(item)) event.preventDefault();
                  }}
                  onDrop={(event) => dropIntoFolder(event, item)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              This folder has no files yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function VaultItemCard({
  item,
  menuOpen,
  canDrop,
  onOpenFolder,
  onDownload,
  onMenuToggle,
  onDetails,
  onMove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop
}: {
  item: VaultItem;
  menuOpen: boolean;
  canDrop: boolean;
  onOpenFolder: () => void;
  onDownload: () => void;
  onMenuToggle: () => void;
  onDetails: () => void;
  onMove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className={`relative rounded-lg border bg-background p-4 transition-colors ${canDrop ? "border-primary bg-primary/5" : "border-border"}`}
      draggable
      onDoubleClick={item.itemType === "folder" ? onOpenFolder : undefined}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge variant={item.itemType === "folder" ? "outline" : "default"}>{item.itemType === "folder" ? "Folder" : "File"}</Badge>
          <div className="mt-3 flex items-start gap-2">
            {item.itemType === "folder" ? <FolderOpen className="mt-0.5 size-4 text-primary" /> : <FileText className="mt-0.5 size-4 text-muted-foreground" />}
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">{item.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatVaultSize(item)}</p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {item.itemType === "folder" ? <Button size="sm" variant="outline" onClick={onOpenFolder}>Enter</Button> : <Button size="sm" variant="outline" onClick={onDownload}>Open</Button>}
          <Button type="button" size="icon" variant="ghost" aria-label={`Options for ${item.name}`} onClick={onMenuToggle}>
            <MoreVertical className="size-4" />
          </Button>
        </div>
      </div>
      {menuOpen ? (
        <div className="absolute right-3 top-12 z-10 w-44 rounded-md border border-border bg-background p-1 shadow-sm">
          <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted" onClick={onDetails}>
            <Info className="size-4" />
            Details
          </button>
          <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted" onClick={onMove}>
            <MoveRight className="size-4" />
            Move to
          </button>
        </div>
      ) : null}
    </div>
  );
}

function VaultMoveTree({
  folders,
  itemToMove,
  onMove,
  disabled,
  parentId = null,
  depth = 0
}: {
  folders: VaultItem[];
  itemToMove: VaultItem;
  onMove: (folderId: string) => void;
  disabled: boolean;
  parentId?: string | null;
  depth?: number;
}) {
  const children = folders.filter((folder) => (folder.parentId ?? null) === parentId);
  if (!children.length && depth === 0) return <p className="text-xs text-muted-foreground">No folders available.</p>;

  return (
    <>
      {children.map((folder) => {
        const blocked = itemToMove.itemType === "folder" && (folder.id === itemToMove.id || isVaultDescendant(folders, folder.id, itemToMove.id));
        return (
          <div key={folder.id} className="flex flex-col gap-1">
            <button
              type="button"
              className="flex items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              style={{ paddingLeft: 12 + depth * 16 }}
              disabled={disabled || blocked}
              onClick={() => onMove(folder.id)}
            >
              <FolderOpen className="size-4 text-primary" />
              {folder.name}
            </button>
            <VaultMoveTree folders={folders} itemToMove={itemToMove} onMove={onMove} disabled={disabled} parentId={folder.id} depth={depth + 1} />
          </div>
        );
      })}
    </>
  );
}

function buildVaultBreadcrumb(folders: VaultItem[], currentFolderId: string | null) {
  const path: VaultItem[] = [];
  let cursor = currentFolderId;
  while (cursor) {
    const folder = folders.find((item) => item.id === cursor);
    if (!folder) break;
    path.unshift(folder);
    cursor = folder.parentId ?? null;
  }
  return path;
}

function isVaultDescendant(folders: VaultItem[], possibleChildId: string, ancestorId: string) {
  let cursor: string | null = possibleChildId;
  while (cursor) {
    if (cursor === ancestorId) return true;
    const folder = folders.find((item) => item.id === cursor);
    cursor = folder?.parentId ?? null;
  }
  return false;
}

function formatVaultSize(item: VaultItem) {
  if (item.itemType === "folder") return "Folder";
  if (!item.sizeBytes) return "Unknown size";
  const bytes = Number(item.sizeBytes);
  if (!Number.isFinite(bytes)) return `${item.sizeBytes} bytes`;
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatAssignedUsers(task: Task) {
  if (!task.assignments.length) return "Unassigned";
  return task.assignments.map((assignment) => assignment.user.displayName).join(", ");
}

function taskMatchesFilter(task: Task, filter: TaskFilter) {
  if (filter === "all") return true;
  if (filter === "not_started") return ["planned", "should_start"].includes(task.status);
  if (filter === "paused") return task.status === "paused";
  if (filter === "closed") return ["done", "accepted"].includes(task.status);
  return true;
}

function maskText(value: string) {
  return value.replace(/[^\s]/g, "*");
}

function MembersView({ project, users, accessToken, onChanged }: { project: Project; users: User[]; accessToken: string; onChanged: () => void }) {
  const [userId, setUserId] = useState("");
  const [projectRole, setProjectRole] = useState("contributor");

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;
    await apiFetch(`/projects/${project.id}/members`, accessToken, { method: "POST", body: JSON.stringify({ userId, projectRole }) });
    setUserId("");
    await onChanged();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Add member</CardTitle>
          <CardDescription>Assign internal or external users to the project.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={addMember}>
            <Field>
              <FieldLabel>User</FieldLabel>
              <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={userId} onChange={(event) => setUserId(event.target.value)}>
                <option value="">Select</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.primaryRole}</option>)}
              </select>
            </Field>
            <Field>
              <FieldLabel>Project role</FieldLabel>
              <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={projectRole} onChange={(event) => setProjectRole(event.target.value)}>
                <option value="project_manager">Project Manager</option>
                <option value="editor">Editor</option>
                <option value="contributor">Contributor</option>
                <option value="viewer">Viewer</option>
                <option value="client_commenter">Commenting client</option>
              </select>
            </Field>
            <Button type="submit">
              <Users data-icon="inline-start" />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{project.members.length} people with project access.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {project.members.map((member) => (
            <div key={member.id} className="rounded-md border border-border p-3">
              <p className="font-medium">{member.user.displayName}</p>
              <p className="text-sm text-muted-foreground">{member.user.email}</p>
              <Badge className="mt-2" variant="outline">{member.projectRole}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditView({ projectId, accessToken }: { projectId: string; accessToken: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  useEffect(() => {
    apiFetch<AuditEvent[]>(`/projects/${projectId}/audit`, accessToken).then(setEvents).catch(() => setEvents([]));
  }, [accessToken, projectId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit</CardTitle>
        <CardDescription>Record of important project actions.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {events.map((event) => (
          <div key={event.id} className="grid gap-2 rounded-md border border-border p-3 text-sm md:grid-cols-[1fr_180px_180px]">
            <span>{event.action}</span>
            <span className="text-muted-foreground">{event.actor?.displayName ?? "System"}</span>
            <span className="text-muted-foreground">{formatDate(event.createdAt)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CreateProjectForm({ accessToken, onCreated }: { accessToken: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await apiFetch("/projects", accessToken, {
      method: "POST",
      body: JSON.stringify({
        name: data.get("name"),
        manufacturingOrder: data.get("manufacturingOrder"),
        description: data.get("description"),
        clientCompanyName: data.get("clientCompanyName"),
        budgetedHours: Number(data.get("budgetedHours") || 0)
      })
    });
    setOpen(false);
    await onCreated();
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <Button className="w-full" variant={open ? "secondary" : "default"} onClick={() => setOpen((value) => !value)}>
        <Plus data-icon="inline-start" />
        New project
      </Button>
      {open ? (
        <form className="mt-3 flex flex-col gap-3" onSubmit={submit}>
          <Input name="name" placeholder="Project name" required />
          <Input name="manufacturingOrder" placeholder="Work order / order no." />
          <Input name="clientCompanyName" placeholder="Client company" required />
          <Input name="budgetedHours" type="number" step="0.01" inputMode="decimal" placeholder="Available hours" defaultValue={80} />
          <Textarea name="description" placeholder="Description" />
          <Button type="submit" size="sm">Create</Button>
        </form>
      ) : null}
    </div>
  );
}

function CreateTaskForm({ project, users, accessToken, onCreated }: { project: Project; users: User[]; accessToken: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [stepDrafts, setStepDrafts] = useState<TaskStepDraft[]>([]);
  const hasStepPlan = stepDrafts.length > 0;
  const stepWeightTotal = stepDrafts.reduce((sum, step) => sum + Number(step.weightPercent || 0), 0);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await apiFetch(`/projects/${project.id}/tasks`, accessToken, {
      method: "POST",
      body: JSON.stringify({
        title: data.get("title"),
        description: data.get("description"),
        milestoneId: data.get("milestoneId") || null,
        categoryId: data.get("categoryId") || null,
        responsibleUserIds: data.getAll("responsibleUserIds"),
        plannedStartAt: data.get("plannedStartAt") ? `${data.get("plannedStartAt")}T08:00:00.000Z` : null,
        plannedEndAt: data.get("plannedEndAt") ? `${data.get("plannedEndAt")}T16:00:00.000Z` : null,
        estimatedHours: Number(data.get("estimatedHours") || 0),
        progressPercent: Number(data.get("progressPercent") || 0),
        steps: buildTaskStepsPayload(stepDrafts)
      })
    });
    form.reset();
    setStepDrafts([]);
    setOpen(false);
    await onCreated();
  }

  return (
    <div className="flex flex-col items-end gap-3">
      <Button onClick={() => setOpen((value) => !value)}>
        <Plus data-icon="inline-start" />
        New task
      </Button>
      {open ? (
        <form className="grid w-full max-w-4xl gap-4 rounded-lg border border-border bg-background p-4" onSubmit={submit}>
          <section className="grid gap-3 md:grid-cols-2">
            <Input name="title" placeholder="Task name" required />
            <Input name="estimatedHours" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Estimated hours" defaultValue={8} disabled={hasStepPlan} />
            <select name="categoryId" className="h-10 rounded-md border border-border bg-background px-3 text-sm">
              <option value="">Category</option>
              {(project.categories ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select name="milestoneId" className="h-10 rounded-md border border-border bg-background px-3 text-sm">
              <option value="">Milestone</option>
              {(project.milestones ?? []).map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.name}</option>)}
            </select>
            <Input name="plannedStartAt" type="date" />
            <Input name="plannedEndAt" type="date" />
            <Input name="progressPercent" type="number" min="0" max="100" step="1" placeholder="Progress %" defaultValue={0} disabled={hasStepPlan} />
            <Textarea name="description" className="md:col-span-2" placeholder="Description" />
          </section>
          <TaskStepsEditor steps={stepDrafts} onChange={setStepDrafts} />
          {hasStepPlan && stepWeightTotal !== 100 ? (
            <p className="rounded-md border border-danger/30 bg-danger/10 p-2 text-xs text-danger">Step weights must add up to 100% before creating the task.</p>
          ) : null}
          <Field>
            <FieldLabel>Assign users</FieldLabel>
            <div className="grid max-h-44 gap-2 overflow-y-auto rounded-md border border-border bg-background p-3 sm:grid-cols-2">
              {users.map((user) => (
                <label key={user.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="responsibleUserIds" value={user.id} />
                  <span>{user.displayName}</span>
                </label>
              ))}
            </div>
          </Field>
          <Button type="submit" disabled={hasStepPlan && stepWeightTotal !== 100}>Create task</Button>
        </form>
      ) : null}
    </div>
  );
}

function TaskStepsSummary({ task }: { task: Task }) {
  const steps = task.steps ?? [];
  if (steps.length === 0) return null;
  const totalHours = steps.reduce((sum, step) => sum + Number(step.estimatedHours ?? 0), 0);
  const totalWeight = steps.reduce((sum, step) => sum + Number(step.weightPercent ?? 0), 0);
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Task steps</p>
          <p className="text-xs text-muted-foreground">{formatHours(totalHours)} planned, {totalWeight}% of total weight configured.</p>
        </div>
        <ListChecks className="size-5 text-primary" />
      </div>
      <div className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <div key={step.id} className="rounded-md border border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{index + 1}. {step.title}</p>
                {step.description ? <p className="mt-1 text-xs text-muted-foreground">{step.description}</p> : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Badge variant="outline">{step.weightPercent}% of task</Badge>
                <Badge variant="outline">{step.progressPercent}%</Badge>
              </div>
            </div>
            <Progress value={step.progressPercent} />
            <p className="mt-2 text-xs text-muted-foreground">{formatHours(step.estimatedHours)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FirstAdminSetup({ onCreated }: { onCreated: () => void }) {
  const [message, setMessage] = useState("");
  const [created, setCreated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function createAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setMessage("");
    try {
      await publicApiFetch("/admin/setup/first-admin", {
        method: "POST",
        body: JSON.stringify({
          username: data.get("username"),
          firstName: data.get("firstName"),
          lastName: data.get("lastName"),
          email: data.get("email"),
          password: data.get("password"),
          locale: "en"
        })
      });
      form.reset();
      setCreated(true);
      onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the administrator");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <Badge className="w-fit" variant="outline">
            Initial setup
          </Badge>
          <CardTitle className="text-2xl">Create the first administrator</CardTitle>
          <CardDescription>
            This instance has no users. Create the first administrator to begin setup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {created ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
                Administrator created. You can now sign in with that account.
              </div>
              <Button onClick={() => signIn("keycloak", undefined, { prompt: "login" })}>
                <ShieldCheck data-icon="inline-start" />
                Sign in with Keycloak
              </Button>
            </div>
          ) : (
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={createAdmin}>
              <Field>
                <FieldLabel>Name</FieldLabel>
                <Input name="firstName" required autoComplete="given-name" />
              </Field>
              <Field>
                <FieldLabel>Last name</FieldLabel>
                <Input name="lastName" required autoComplete="family-name" />
              </Field>
              <Field>
                <FieldLabel>Username</FieldLabel>
                <Input name="username" required minLength={2} autoComplete="username" />
              </Field>
              <Field>
                <FieldLabel>Email</FieldLabel>
                <Input name="email" type="email" required autoComplete="email" />
              </Field>
              <Field>
                <FieldLabel>Password</FieldLabel>
                <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
                <FieldDescription>At least 8 characters.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Language</FieldLabel>
                <Input value="English" readOnly />
              </Field>
              {message ? <p className="sm:col-span-2 rounded-md bg-danger/10 p-3 text-sm text-danger">{message}</p> : null}
              <div className="sm:col-span-2">
                <Button type="submit" disabled={submitting}>
                  <ShieldCheck data-icon="inline-start" />
                  {submitting ? "Creating..." : "Create administrator"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function TaskStepsEditor({ steps, onChange }: { steps: TaskStepDraft[]; onChange: (steps: TaskStepDraft[]) => void }) {
  const totalWeight = steps.reduce((sum, step) => sum + Number(step.weightPercent || 0), 0);
  const totalHours = steps.reduce((sum, step) => sum + Number(step.estimatedHours || 0), 0);
  const calculatedProgress = calculateDraftTaskProgress(steps);

  function updateStep(index: number, patch: Partial<TaskStepDraft>) {
    onChange(steps.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step)));
  }

  function addStep() {
    const remainingWeight = Math.max(0, 100 - totalWeight);
    onChange([
      ...steps,
      {
        title: "",
        description: "",
        estimatedHours: 0,
        weightPercent: steps.length === 0 ? 100 : remainingWeight,
        progressPercent: 0,
        sortOrder: steps.length
      }
    ]);
  }

  function removeStep(index: number) {
    onChange(steps.filter((_, stepIndex) => stepIndex !== index).map((step, sortOrder) => ({ ...step, sortOrder })));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Work steps</p>
          <p className="text-xs text-muted-foreground">Each step contributes a weight to the task’s overall progress.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={totalWeight === 100 || steps.length === 0 ? "secondary" : "outline"}>Weight {totalWeight}%</Badge>
          <Badge variant="outline">{formatHours(totalHours)}</Badge>
          <Badge variant="outline">Progress {calculatedProgress}%</Badge>
          <Button type="button" size="sm" variant="outline" onClick={addStep}>
            <Plus data-icon="inline-start" />
            Add step
          </Button>
        </div>
      </div>
      {steps.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/25 p-3 text-sm text-muted-foreground">
          No steps. The task will use manually entered hours and progress.
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <div key={`${step.id ?? "new"}-${index}`} className="grid gap-3 rounded-md border border-border bg-muted/25 p-3 lg:grid-cols-[1fr_120px_120px_120px_auto]">
            <Field className="lg:col-span-1">
              <FieldLabel>Step {index + 1}</FieldLabel>
              <Input value={step.title} onChange={(event) => updateStep(index, { title: event.target.value })} placeholder="Step name" required />
            </Field>
            <Field>
              <FieldLabel>Hours</FieldLabel>
              <Input type="number" min="0" step="0.01" inputMode="decimal" value={step.estimatedHours} onChange={(event) => updateStep(index, { estimatedHours: Number(event.target.value || 0) })} />
            </Field>
            <Field>
              <FieldLabel>Weight %</FieldLabel>
              <Input type="number" min="0" max="100" step="1" value={step.weightPercent} onChange={(event) => updateStep(index, { weightPercent: Number(event.target.value || 0) })} />
            </Field>
            <Field>
              <FieldLabel>Progress %</FieldLabel>
              <Input type="number" min="0" max="100" step="1" value={step.progressPercent} onChange={(event) => updateStep(index, { progressPercent: Number(event.target.value || 0) })} />
            </Field>
            <div className="flex items-end">
              <Button type="button" size="icon" variant="outline" title="Delete step" aria-label="Delete step" onClick={() => removeStep(index)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
            <Field className="lg:col-span-5">
              <FieldLabel>Step description</FieldLabel>
              <Textarea value={step.description} onChange={(event) => updateStep(index, { description: event.target.value })} placeholder="Details, completion criteria, or dependencies" />
            </Field>
            <div className="lg:col-span-5">
              <Progress value={step.progressPercent} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function HealthBlock({ label, value, tone }: { label: string; value: string; tone: "normal" | "danger" }) {
  return (
    <div className={`rounded-lg border p-4 ${tone === "danger" ? "border-danger/30 bg-danger/10" : "border-border bg-muted/40"}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function stepsFromTask(task: Task | null): TaskStepDraft[] {
  return (task?.steps ?? []).map((step, index) => ({
    id: step.id,
    title: step.title,
    description: step.description ?? "",
    estimatedHours: Number(step.estimatedHours ?? 0),
    weightPercent: Number(step.weightPercent ?? 0),
    progressPercent: Number(step.progressPercent ?? 0),
    sortOrder: Number(step.sortOrder ?? index)
  }));
}

function buildTaskStepsPayload(steps: TaskStepDraft[]) {
  return steps
    .map((step, index) => ({
      id: step.id,
      title: step.title.trim(),
      description: step.description.trim(),
      estimatedHours: Number(step.estimatedHours || 0),
      weightPercent: Number(step.weightPercent || 0),
      progressPercent: Number(step.progressPercent || 0),
      sortOrder: index
    }))
    .filter((step) => step.title.length > 0);
}

function calculateDraftTaskProgress(steps: TaskStepDraft[]) {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        steps.reduce((sum, step) => {
          const weight = Math.max(0, Math.min(100, Number(step.weightPercent || 0)));
          const progress = Math.max(0, Math.min(100, Number(step.progressPercent || 0)));
          return sum + progress * (weight / 100);
        }, 0)
      )
    )
  );
}

function EmptyWorkspace() {
  return <FullScreenMessage title="No projects" description="Create your first project to start planning." />;
}

function FullScreenMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <Clock3 className="mx-auto mb-3 text-primary" />
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
