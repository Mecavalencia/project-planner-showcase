"use client";

import { FormEvent, Fragment, MouseEvent, MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Filter, Pencil, Plus, Trash2, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { Project, User, WorkloadTask } from "@/lib/types";
import { formatDate, formatHours } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

type AdminTab = "usuarios" | "carga" | "calendario";
type CalendarMode = "week" | "month" | "year" | "range";
type WorkloadBreakdownMode = "project" | "date" | "weekday";

export function AdminPanel({ accessToken, users, projects, onUsersChanged }: { accessToken: string; users: User[]; projects: Project[]; onUsersChanged: () => void }) {
  const [tab, setTab] = useState<AdminTab>("usuarios");
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? "");
  const [workload, setWorkload] = useState<WorkloadTask[]>([]);
  const [workloadProjectId, setWorkloadProjectId] = useState("all");
  const [workloadBreakdownMode, setWorkloadBreakdownMode] = useState<WorkloadBreakdownMode>("project");
  const [workloadFrom, setWorkloadFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [workloadTo, setWorkloadTo] = useState(() => addDays(new Date(), 14).toISOString().slice(0, 10));
  const [message, setMessage] = useState("");
  const workloadRange = useMemo(() => workloadDateRange(workloadFrom, workloadTo), [workloadFrom, workloadTo]);

  const loadWorkload = useCallback(async () => {
    if (!selectedUserId) return;
    const params = new URLSearchParams();
    if (workloadRange.from) params.set("from", workloadRange.from);
    if (workloadRange.to) params.set("to", workloadRange.to);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    try {
      const items = await apiFetch<WorkloadTask[]>(`/admin/users/${selectedUserId}/workload${suffix}`, accessToken);
      setWorkload(items);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load workload");
    }
  }, [accessToken, selectedUserId, workloadRange.from, workloadRange.to]);

  useEffect(() => {
    if (!selectedUserId && users[0]) setSelectedUserId(users[0].id);
  }, [selectedUserId, users]);

  useEffect(() => {
    let mounted = true;
    loadWorkload().catch((error) => {
      if (mounted) setMessage(error instanceof Error ? error.message : "Could not load workload");
    });
    return () => {
      mounted = false;
    };
  }, [loadWorkload]);

  const visibleWorkload = useMemo(
    () => workload.filter((task) => workloadProjectId === "all" || task.project.id === workloadProjectId),
    [workload, workloadProjectId]
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4 rounded-xl border border-border bg-background/85 p-5 shadow-soft">
        <div>
          <Badge variant="outline">Admin</Badge>
          <h2 className="mt-3 text-2xl font-semibold">Administration</h2>
          <p className="mt-2 text-sm text-muted-foreground">Manage users, workload, and the shared calendar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["usuarios", "Users"],
            ["carga", "Workload"],
            ["calendario", "Calendar"]
          ].map(([id, label]) => (
            <Button key={id} size="sm" variant={tab === id ? "default" : "outline"} onClick={() => setTab(id as AdminTab)}>
              {id === "calendario" ? <CalendarDays data-icon="inline-start" /> : <Users data-icon="inline-start" />}
              {label}
            </Button>
          ))}
        </div>
      </header>

      {message ? <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{message}</div> : null}
      {tab === "usuarios" ? <AdminUsers accessToken={accessToken} users={users} onCreated={onUsersChanged} setMessage={setMessage} /> : null}
      {tab === "carga" ? (
        <WorkloadPanel
          accessToken={accessToken}
          users={users}
          projects={projects}
          selectedUserId={selectedUserId}
          setSelectedUserId={setSelectedUserId}
          workload={visibleWorkload}
          workloadProjectId={workloadProjectId}
          setWorkloadProjectId={setWorkloadProjectId}
          workloadBreakdownMode={workloadBreakdownMode}
          setWorkloadBreakdownMode={setWorkloadBreakdownMode}
          workloadFrom={workloadFrom}
          setWorkloadFrom={setWorkloadFrom}
          workloadTo={workloadTo}
          setWorkloadTo={setWorkloadTo}
          workloadRange={workloadRange}
          onChanged={async () => {
            await loadWorkload();
            await onUsersChanged();
          }}
          setMessage={setMessage}
        />
      ) : null}
      {tab === "calendario" ? <WorkloadCalendar users={users} selectedUserId={selectedUserId} setSelectedUserId={setSelectedUserId} workload={workload} /> : null}
    </div>
  );
}

function AdminUsers({ accessToken, users, onCreated, setMessage }: { accessToken: string; users: User[]; onCreated: () => void; setMessage: (message: string) => void }) {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await apiFetch("/admin/users", accessToken, {
      method: "POST",
      body: JSON.stringify({
        firstName: data.get("firstName"),
        lastName: data.get("lastName"),
        username: data.get("username"),
        email: data.get("email"),
        password: data.get("password"),
        locale: "en",
        role: data.get("role")
      })
    });
    form.reset();
    setMessage("User created.");
    await onCreated();
  }

  async function updateUser(event: FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await apiFetch(`/admin/users/${userId}`, accessToken, {
      method: "PATCH",
      body: JSON.stringify({
        firstName: data.get("firstName"),
        lastName: data.get("lastName"),
        username: data.get("username"),
        email: data.get("email"),
        password: data.get("password"),
        locale: "en",
        role: data.get("role")
      })
    });
    setEditingUserId(null);
    setMessage("User updated.");
    await onCreated();
  }

  async function deleteUser(user: User) {
    if (!window.confirm(`Delete user ${user.displayName}? Their access will be disabled, and their history will be retained.`)) return;
    await apiFetch(`/admin/users/${user.id}`, accessToken, { method: "DELETE" });
    setMessage("User deleted.");
    await onCreated();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Create user</CardTitle>
          <CardDescription>Create the account in Keycloak and synchronize it with the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-1" onSubmit={createUser}>
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input name="firstName" required />
            </Field>
            <Field>
              <FieldLabel>Last name</FieldLabel>
              <Input name="lastName" required />
            </Field>
            <Field>
              <FieldLabel>User</FieldLabel>
              <Input name="username" required />
            </Field>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input name="email" type="email" required />
            </Field>
            <Field>
              <FieldLabel>Password</FieldLabel>
              <Input name="password" type="password" minLength={8} required />
            </Field>
            <Field>
              <FieldLabel>Language</FieldLabel>
              <select name="locale" className="h-10 rounded-md border border-border bg-background px-3 text-sm" defaultValue="en" disabled>
                <option value="en">English</option>
              </select>
            </Field>
            <Field>
              <FieldLabel>Global role</FieldLabel>
              <select name="role" className="h-10 rounded-md border border-border bg-background px-3 text-sm" defaultValue="member">
                <option value="admin">Admin</option>
                <option value="project_manager">Project Manager</option>
                <option value="member">Member</option>
                <option value="external_client">External client</option>
                <option value="viewer">Viewer</option>
              </select>
            </Field>
            <Button type="submit">
              <Plus data-icon="inline-start" />
              Create user
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>{users.length} users available.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground">
                <th className="border-b border-border p-3">Name</th>
                <th className="border-b border-border p-3">User</th>
                <th className="border-b border-border p-3">Email</th>
                <th className="border-b border-border p-3">Role</th>
                <th className="border-b border-border p-3">Language</th>
                <th className="border-b border-border p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <Fragment key={user.id}>
                  <tr className="hover:bg-muted/50">
                    <td className="border-b border-border p-3 font-medium">{user.displayName}</td>
                    <td className="border-b border-border p-3">{user.username}</td>
                    <td className="border-b border-border p-3">{user.email}</td>
                    <td className="border-b border-border p-3"><Badge variant="outline">{user.primaryRole}</Badge></td>
                    <td className="border-b border-border p-3">{user.locale ?? "en"}</td>
                    <td className="border-b border-border p-3">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditingUserId(editingUserId === user.id ? null : user.id)}>
                          <Pencil data-icon="inline-start" />
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => deleteUser(user)}>
                          <Trash2 data-icon="inline-start" />
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {editingUserId === user.id ? (
                    <tr key={`${user.id}-edit`}>
                      <td colSpan={6} className="border-b border-border bg-muted/35 p-3">
                        <form className="grid gap-3 md:grid-cols-3" onSubmit={(event) => updateUser(event, user.id)}>
                          <Field>
                            <FieldLabel>Name</FieldLabel>
                            <Input name="firstName" defaultValue={user.firstName ?? ""} required />
                          </Field>
                          <Field>
                            <FieldLabel>Last name</FieldLabel>
                            <Input name="lastName" defaultValue={user.lastName ?? ""} required />
                          </Field>
                          <Field>
                            <FieldLabel>User</FieldLabel>
                            <Input name="username" defaultValue={user.username} required />
                          </Field>
                          <Field>
                            <FieldLabel>Email</FieldLabel>
                            <Input name="email" type="email" defaultValue={user.email} required />
                          </Field>
                          <Field>
                            <FieldLabel>New password</FieldLabel>
                            <Input name="password" type="password" minLength={8} placeholder="Keep current" />
                          </Field>
                          <Field>
                            <FieldLabel>Global role</FieldLabel>
                            <select name="role" className="h-10 rounded-md border border-border bg-background px-3 text-sm" defaultValue={user.primaryRole}>
                              <option value="admin">Admin</option>
                              <option value="project_manager">Project Manager</option>
                              <option value="member">Member</option>
                              <option value="external_client">External client</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          </Field>
                          <div className="flex gap-2 md:col-span-3">
                            <Button size="sm" type="submit">Save user</Button>
                            <Button size="sm" type="button" variant="outline" onClick={() => setEditingUserId(null)}>Cancel</Button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkloadPanel({
  accessToken,
  users,
  projects,
  selectedUserId,
  setSelectedUserId,
  workload,
  workloadProjectId,
  setWorkloadProjectId,
  workloadBreakdownMode,
  setWorkloadBreakdownMode,
  workloadFrom,
  setWorkloadFrom,
  workloadTo,
  setWorkloadTo,
  workloadRange,
  onChanged,
  setMessage
}: {
  accessToken: string;
  users: User[];
  projects: Project[];
  selectedUserId: string;
  setSelectedUserId: (userId: string) => void;
  workload: WorkloadTask[];
  workloadProjectId: string;
  setWorkloadProjectId: (projectId: string) => void;
  workloadBreakdownMode: WorkloadBreakdownMode;
  setWorkloadBreakdownMode: (mode: WorkloadBreakdownMode) => void;
  workloadFrom: string;
  setWorkloadFrom: (value: string) => void;
  workloadTo: string;
  setWorkloadTo: (value: string) => void;
  workloadRange: { from?: string; to?: string; label: string };
  onChanged: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  const projectGroups = useMemo(() => groupByProject(workload), [workload]);
  const dayGroups = useMemo(
    () => buildWorkloadDayBuckets(workload, workloadRange.from, workloadRange.to, workloadBreakdownMode),
    [workload, workloadBreakdownMode, workloadRange.from, workloadRange.to]
  );
  const isDailyBreakdown = workloadBreakdownMode !== "project";
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]">
      <Card className="min-w-0 2xl:sticky 2xl:top-4 2xl:self-start">
        <CardHeader>
          <CardTitle>New task for a team member</CardTitle>
          <CardDescription>Create a task in an existing project and assign it to {selectedUser?.displayName ?? "the selected user"}.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminWorkloadTaskForm accessToken={accessToken} projects={projects} selectedUserId={selectedUserId} onCreated={onChanged} setMessage={setMessage} />
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Workload</CardTitle>
            <CardDescription>{workloadRange.label}. {workload.length} visible tasks.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <UserSelect users={users} selectedUserId={selectedUserId} onChange={setSelectedUserId} />
            <ProjectSelect projects={projects} selectedProjectId={workloadProjectId} onChange={setWorkloadProjectId} />
            <Input className="w-40" type="date" value={workloadFrom} onChange={(event) => setWorkloadFrom(event.target.value)} aria-label="Range start date" />
            <Input className="w-40" type="date" value={workloadTo} onChange={(event) => setWorkloadTo(event.target.value)} aria-label="Range end date" />
            <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={workloadBreakdownMode} onChange={(event) => setWorkloadBreakdownMode(event.target.value as WorkloadBreakdownMode)}>
              <option value="project">By project</option>
              <option value="date">Calendar days</option>
              <option value="weekday">Day of week</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/35 p-3 text-sm text-muted-foreground">
            <Filter className="size-4" />
            <span>{workloadProjectId === "all" ? "All projects" : projects.find((project) => project.id === workloadProjectId)?.name ?? "Filtered project"}</span>
            <span>·</span>
            <span>{workloadRange.label}</span>
            <span>·</span>
            <span>{breakdownModeLabel(workloadBreakdownMode)}</span>
          </div>
          {isDailyBreakdown ? (
            dayGroups.map((group) => (
              <section key={group.id} className="rounded-md border border-border">
                <div className="flex items-center gap-3 border-b border-border p-3">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{group.label}</p>
                    <p className="text-xs text-muted-foreground">{group.tasks.length} tasks · {formatHours(group.estimatedHours)} estimated</p>
                  </div>
                </div>
                {group.tasks.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No tasks planned for this day.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-sm">
                      <tbody>
                        {group.tasks.map((task) => (
                          <tr key={`${group.id}-${task.id}`} className="hover:bg-muted/50">
                            <td className="border-b border-border p-3">
                              <div className="flex items-center gap-2">
                                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: task.project.color }} />
                                <div>
                                  <p className="font-medium">{task.title}</p>
                                  <p className="text-xs text-muted-foreground">{task.project.manufacturingOrder ? `${task.project.name} · Work order ${task.project.manufacturingOrder}` : task.project.name}</p>
                                </div>
                              </div>
                            </td>
                            <td className="border-b border-border p-3">{task.milestone?.name ?? "No milestone"}</td>
                            <td className="border-b border-border p-3">{formatDate(task.plannedStartAt)} - {formatDate(task.plannedEndAt)}</td>
                            <td className="border-b border-border p-3">{formatHours(task.actualHours)} / {formatHours(task.estimatedHours)}</td>
                            <td className="border-b border-border p-3"><Progress value={task.progressPercent} /></td>
                            <td className="border-b border-border p-3"><Badge variant="outline">{task.status}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))
          ) : null}
          {!isDailyBreakdown && projectGroups.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No assigned tasks match the selected filters.
            </div>
          ) : null}
          {!isDailyBreakdown ? projectGroups.map((group) => (
            <section key={group.project.id} className="rounded-md border border-border">
              <div className="flex items-center gap-3 border-b border-border p-3">
                <span className="h-4 w-4 rounded-sm" style={{ backgroundColor: group.project.color }} />
                <div>
                  <p className="font-medium">{group.project.name}</p>
                  {group.project.manufacturingOrder ? <p className="text-xs text-muted-foreground">Work order: {group.project.manufacturingOrder}</p> : null}
                  <p className="text-xs text-muted-foreground">{group.tasks.length} tasks · {formatHours(group.estimatedHours)} estimated</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <tbody>
                    {group.tasks.map((task) => (
                      <tr key={task.id} className="hover:bg-muted/50">
                        <td className="border-b border-border p-3 font-medium">{task.title}</td>
                        <td className="border-b border-border p-3">{task.milestone?.name ?? "No milestone"}</td>
                        <td className="border-b border-border p-3">{formatDate(task.plannedStartAt)} - {formatDate(task.plannedEndAt)}</td>
                        <td className="border-b border-border p-3">{formatHours(task.actualHours)} / {formatHours(task.estimatedHours)}</td>
                        <td className="border-b border-border p-3"><Progress value={task.progressPercent} /></td>
                        <td className="border-b border-border p-3"><Badge variant="outline">{task.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function AdminWorkloadTaskForm({
  accessToken,
  projects,
  selectedUserId,
  onCreated,
  setMessage
}: {
  accessToken: string;
  projects: Project[];
  selectedUserId: string;
  onCreated: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const selectedProject = projects.find((project) => project.id === projectId) ?? projects[0];
  const milestones = selectedProject?.milestones ?? [];
  const categories = selectedProject?.categories ?? [];

  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
    if (projectId && !projects.some((project) => project.id === projectId)) setProjectId(projects[0]?.id ?? "");
  }, [projectId, projects]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!selectedProject || !selectedUserId) return;
    await apiFetch(`/projects/${selectedProject.id}/tasks`, accessToken, {
      method: "POST",
      body: JSON.stringify({
        title: data.get("title"),
        description: data.get("description"),
        milestoneId: data.get("milestoneId") || null,
        categoryId: data.get("categoryId") || null,
        responsibleUserIds: [selectedUserId],
        priority: data.get("priority"),
        plannedStartAt: data.get("plannedStartAt") ? `${data.get("plannedStartAt")}T08:00:00.000Z` : null,
        plannedEndAt: data.get("plannedEndAt") ? `${data.get("plannedEndAt")}T16:00:00.000Z` : null,
        estimatedHours: Number(data.get("estimatedHours") || 0),
        progressPercent: 0
      })
    });
    form.reset();
    setProjectId(selectedProject.id);
    setMessage("Task created and assigned.");
    await onCreated();
  }

  return (
    <form className="grid gap-3" onSubmit={createTask}>
      <Field>
        <FieldLabel>Project</FieldLabel>
        <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={projectId} onChange={(event) => setProjectId(event.target.value)} required>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.manufacturingOrder ? `${project.name} · Work order ${project.manufacturingOrder}` : project.name}
            </option>
          ))}
        </select>
      </Field>
      <Field>
        <FieldLabel>Task</FieldLabel>
        <Input name="title" required minLength={3} />
      </Field>
      <Field>
        <FieldLabel>Description</FieldLabel>
        <Textarea name="description" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel>Category</FieldLabel>
          <select name="categoryId" className="h-10 rounded-md border border-border bg-background px-3 text-sm" defaultValue="">
            <option value="">No category</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </Field>
        <Field>
          <FieldLabel>Milestone</FieldLabel>
          <select name="milestoneId" className="h-10 rounded-md border border-border bg-background px-3 text-sm" defaultValue="">
            <option value="">No milestone</option>
            {milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.name}</option>)}
          </select>
        </Field>
        <Field>
          <FieldLabel>Start</FieldLabel>
          <Input name="plannedStartAt" type="date" />
        </Field>
        <Field>
          <FieldLabel>End</FieldLabel>
          <Input name="plannedEndAt" type="date" />
        </Field>
        <Field>
          <FieldLabel>Estimated hours</FieldLabel>
          <Input name="estimatedHours" type="number" min="0" step="0.01" inputMode="decimal" defaultValue="0" />
        </Field>
        <Field>
          <FieldLabel>Priority</FieldLabel>
          <select name="priority" className="h-10 rounded-md border border-border bg-background px-3 text-sm" defaultValue="medium">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </Field>
      </div>
      <Button type="submit" disabled={!selectedUserId || !selectedProject}>
        <Plus data-icon="inline-start" />
        Create and assign
      </Button>
    </form>
  );
}

function WorkloadView({ users, selectedUserId, setSelectedUserId, workload }: { users: User[]; selectedUserId: string; setSelectedUserId: (userId: string) => void; workload: WorkloadTask[] }) {
  const grouped = useMemo(() => groupByProject(workload), [workload]);
  return (
    <Card>
      <CardHeader className="flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle>Workload</CardTitle>
          <CardDescription>Tasks assigned to the selected user.</CardDescription>
        </div>
        <UserSelect users={users} selectedUserId={selectedUserId} onChange={setSelectedUserId} />
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {grouped.map((group) => (
          <section key={group.project.id} className="rounded-md border border-border">
            <div className="flex items-center gap-3 border-b border-border p-3">
              <span className="h-4 w-4 rounded-sm" style={{ backgroundColor: group.project.color }} />
              <div>
                <p className="font-medium">{group.project.name}</p>
                {group.project.manufacturingOrder ? <p className="text-xs text-muted-foreground">Work order: {group.project.manufacturingOrder}</p> : null}
                <p className="text-xs text-muted-foreground">{group.tasks.length} tasks · {formatHours(group.estimatedHours)} estimated</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <tbody>
                  {group.tasks.map((task) => (
                    <tr key={task.id} className="hover:bg-muted/50">
                      <td className="border-b border-border p-3 font-medium">{task.title}</td>
                      <td className="border-b border-border p-3">{task.milestone?.name ?? "No milestone"}</td>
                      <td className="border-b border-border p-3">{formatDate(task.plannedStartAt)} - {formatDate(task.plannedEndAt)}</td>
                      <td className="border-b border-border p-3">{formatHours(task.actualHours)} / {formatHours(task.estimatedHours)}</td>
                      <td className="border-b border-border p-3"><Progress value={task.progressPercent} /></td>
                      <td className="border-b border-border p-3"><Badge variant="outline">{task.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

function WorkloadCalendar({ users, selectedUserId, setSelectedUserId, workload }: { users: User[]; selectedUserId: string; setSelectedUserId: (userId: string) => void; workload: WorkloadTask[] }) {
  const [mode, setMode] = useState<CalendarMode>("year");
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [fromYear, setFromYear] = useState(new Date().getFullYear());
  const [toYear, setToYear] = useState(new Date().getFullYear() + 1);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const sections = useMemo(() => buildCalendarSections(mode, anchor, fromYear, toYear), [anchor, fromYear, mode, toYear]);
  const byDay = useMemo(() => buildCalendarIndex(workload), [workload]);
  const legendProjects = useMemo(() => uniqueProjects(workload), [workload]);
  const selectedTasks = selectedDay ? byDay.get(selectedDay) ?? [] : [];
  const density = getCalendarDensity(mode, sections.length);

  useEffect(() => {
    setSelectedDay(null);
    setPopoverPosition(null);
  }, [mode, selectedUserId]);

  useEffect(() => {
    if (!selectedDay) return;
    function closeOnOutsideClick(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-calendar-day]")) return;
      setSelectedDay(null);
      setPopoverPosition(null);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [selectedDay]);

  function selectCalendarDay(day: string, event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const preferredLeft = rect.left + rect.width / 2;
    const left = Math.max(180, Math.min(window.innerWidth - 180, preferredLeft));
    const top = Math.min(window.innerHeight - 260, rect.bottom + 10);
    setSelectedDay(day);
    setPopoverPosition({ left, top: Math.max(20, top) });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Calendar</CardTitle>
            <CardDescription>Project workload by user and date.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <UserSelect users={users} selectedUserId={selectedUserId} onChange={setSelectedUserId} />
            <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={mode} onChange={(event) => setMode(event.target.value as CalendarMode)}>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
              <option value="range">Year range</option>
            </select>
            {mode === "range" ? (
              <>
                <Input className="w-24" type="number" value={fromYear} onChange={(event) => setFromYear(Number(event.target.value))} />
                <Input className="w-24" type="number" value={toYear} onChange={(event) => setToYear(Number(event.target.value))} />
              </>
            ) : (
              <Input className="w-40" type="date" value={anchor} onChange={(event) => setAnchor(event.target.value)} />
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3 rounded-md border border-border bg-muted/35 p-3">
            {legendProjects.length === 0 ? <p className="text-sm text-muted-foreground">No dated tasks to display.</p> : null}
            {legendProjects.map((project) => (
              <div key={project.id} className="flex items-center gap-2 text-xs">
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: project.color }} />
                <span>{project.manufacturingOrder ? `${project.name} · Work order ${project.manufacturingOrder}` : project.name}</span>
              </div>
            ))}
          </div>
          <div className={sections.length > 1 ? "flex gap-8 overflow-x-auto pb-2" : "flex flex-col items-center gap-6"}>
            {sections.map((section) => (
              <section key={section.year} className={sections.length > 1 ? sectionWidthClass(density) : "w-full max-w-full"}>
                <h3 className="mb-3 text-center text-xl font-semibold text-muted-foreground">{section.year}</h3>
                <div className={monthListClass(density)}>
                  {section.months.map((month) => (
                    <MonthHeatmap
                      key={month.key}
                      month={month}
                      byDay={byDay}
                      selectedDay={selectedDay}
                      onSelectDay={selectCalendarDay}
                      density={density}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </CardContent>
      </Card>
      {selectedDay && popoverPosition ? (
        <CalendarDayPopover refElement={popoverRef} day={selectedDay} tasks={selectedTasks} position={popoverPosition} />
      ) : null}
    </div>
  );
}

function UserSelect({ users, selectedUserId, onChange }: { users: User[]; selectedUserId: string; onChange: (userId: string) => void }) {
  return (
    <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={selectedUserId} onChange={(event) => onChange(event.target.value)}>
      {users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
    </select>
  );
}

function ProjectSelect({ projects, selectedProjectId, onChange }: { projects: Project[]; selectedProjectId: string; onChange: (projectId: string) => void }) {
  return (
    <select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={selectedProjectId} onChange={(event) => onChange(event.target.value)}>
      <option value="all">All projects</option>
      {projects.map((project) => (
        <option key={project.id} value={project.id}>
          {project.manufacturingOrder ? `${project.name} · Work order ${project.manufacturingOrder}` : project.name}
        </option>
      ))}
    </select>
  );
}

function workloadDateRange(fromValue: string, toValue: string) {
  const fromDate = parseDateInput(fromValue);
  const toDate = parseDateInput(toValue);
  if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) return { label: "Range has no valid dates" };
  const from = fromDate <= toDate ? fromValue : toValue;
  const to = fromDate <= toDate ? toValue : fromValue;
  return { from, to, label: `Range ${formatDate(from)} - ${formatDate(to)}` };
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date(Number.NaN);
  return new Date(year, month - 1, day);
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function groupByProject(tasks: WorkloadTask[]) {
  const groups = new Map<string, { project: WorkloadTask["project"]; tasks: WorkloadTask[]; estimatedHours: number }>();
  for (const task of tasks) {
    const current = groups.get(task.project.id) ?? { project: task.project, tasks: [], estimatedHours: 0 };
    current.tasks.push(task);
    current.estimatedHours += Number(task.estimatedHours ?? 0);
    groups.set(task.project.id, current);
  }
  return Array.from(groups.values());
}

function buildWorkloadDayBuckets(tasks: WorkloadTask[], fromValue: string | undefined, toValue: string | undefined, mode: WorkloadBreakdownMode) {
  if (!fromValue || !toValue || mode === "project") return [];
  const fromDate = parseDateInput(fromValue);
  const toDate = parseDateInput(toValue);
  if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) return [];

  const start = fromDate <= toDate ? fromDate : toDate;
  const end = fromDate <= toDate ? toDate : fromDate;
  const groups: { id: string; label: string; tasks: WorkloadTask[]; estimatedHours: number }[] = [];

  for (let day = startOfDay(start); day <= end; day = addDays(day, 1)) {
    const dayKey = toLocalDateKey(day);
    const dayTasks = tasks.filter((task) => taskOverlapsDay(task, day));
    groups.push({
      id: dayKey,
      label: formatWorkloadDayLabel(day, mode),
      tasks: dayTasks,
      estimatedHours: dayTasks.reduce((total, task) => total + Number(task.estimatedHours ?? 0), 0)
    });
  }

  return groups;
}

function taskOverlapsDay(task: WorkloadTask, day: Date) {
  if (!task.plannedStartAt || !task.plannedEndAt) return false;
  const start = startOfDay(new Date(task.plannedStartAt));
  const end = startOfDay(new Date(task.plannedEndAt));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;
  const rangeStart = start <= end ? start : end;
  const rangeEnd = start <= end ? end : start;
  return day >= rangeStart && day <= rangeEnd;
}

function formatWorkloadDayLabel(day: Date, mode: WorkloadBreakdownMode) {
  const natural = `${day.getDate()} ${monthFullLabels[day.getMonth()]}`;
  if (mode === "weekday") return `${weekdayLabels[day.getDay()]} (${natural})`;
  return natural;
}

function breakdownModeLabel(mode: WorkloadBreakdownMode) {
  if (mode === "date") return "Calendar days";
  if (mode === "weekday") return "Day of week";
  return "By project";
}

function buildCalendarIndex(tasks: WorkloadTask[]) {
  const byDay = new Map<string, WorkloadTask[]>();
  for (const task of tasks) {
    if (!task.plannedStartAt || !task.plannedEndAt) continue;
    const start = startOfDay(new Date(task.plannedStartAt));
    const end = startOfDay(new Date(task.plannedEndAt));
    for (let day = start; day <= end; day = addDays(day, 1)) {
      const key = toDateKey(day);
      byDay.set(key, [...(byDay.get(key) ?? []), task]);
    }
  }
  return byDay;
}

interface CalendarDay {
  key: string;
  label: string;
  inRange: boolean;
}

interface CalendarMonth {
  key: string;
  label: string;
  days: CalendarDay[];
}

interface CalendarSection {
  year: number;
  months: CalendarMonth[];
}

function MonthHeatmap({
  month,
  byDay,
  selectedDay,
  onSelectDay,
  density
}: {
  month: CalendarMonth;
  byDay: Map<string, WorkloadTask[]>;
  selectedDay: string | null;
  onSelectDay: (day: string, event: MouseEvent<HTMLButtonElement>) => void;
  density: CalendarDensity;
}) {
  const cellSize = calendarCellSize(density);
  const labelWidth = density === "month" || density === "week" ? 56 : 42;
  return (
    <div className="grid w-fit items-start gap-2" style={{ gridTemplateColumns: `${labelWidth}px auto` }}>
      <span className="pt-6 text-xs text-muted-foreground">{month.label}</span>
      <div>
        <div className="mb-1 grid text-center text-[10px] font-medium text-muted-foreground" style={{ gridTemplateColumns: `repeat(7, ${cellSize}px)` }}>
          {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={index}>{day}</span>)}
        </div>
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(7, ${cellSize}px)` }}>
          {month.days.map((day) => {
            const tasks = byDay.get(day.key) ?? [];
            const projects = uniqueProjects(tasks);
            const active = day.inRange;
            return (
              <button
                key={day.key}
                data-calendar-day="true"
                className={`overflow-hidden rounded-[3px] border transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary ${selectedDay === day.key ? "border-primary" : active ? "border-border" : "border-transparent opacity-25"}`}
                style={{ width: cellSize, height: cellSize }}
                title={`${formatDate(day.key)} · ${tasks.length} tasks`}
                onClick={(event) => onSelectDay(day.key, event)}
              >
                {projects.length > 0 ? (
                  <span className="flex h-full w-full">
                    {projects.map((project) => <span key={project.id} className="min-w-[3px] flex-1" style={{ backgroundColor: project.color }} />)}
                  </span>
                ) : (
                  <span className={`block h-full w-full ${active ? "bg-muted" : "bg-transparent"}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CalendarDayPopover({
  refElement,
  day,
  tasks,
  position
}: {
  refElement: MutableRefObject<HTMLDivElement | null>;
  day: string;
  tasks: WorkloadTask[];
  position: { left: number; top: number };
}) {
  return (
    <div
      ref={refElement}
      className="fixed z-50 max-h-[360px] w-[360px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-xl"
      style={{ left: position.left, top: position.top, transform: "translateX(-50%)" }}
      role="dialog"
      aria-label={`Tasks for ${formatDate(day)}`}
    >
      <div className="mb-3">
        <p className="text-sm font-semibold">{formatDate(day)}</p>
        <p className="text-xs text-muted-foreground">{tasks.length} planned tasks</p>
      </div>
      {tasks.length === 0 ? <p className="text-sm text-muted-foreground">No tasks planned for this day.</p> : null}
      <div className="flex flex-col gap-3">
        {tasks.map((task) => (
          <div key={task.id} className="rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: task.project.color }} />
              <p className="text-sm font-medium">{task.project.manufacturingOrder ? `${task.project.name} · Work order ${task.project.manufacturingOrder}` : task.project.name}</p>
            </div>
            <p className="mt-2 text-sm font-medium">{task.title}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>{task.milestone?.name ?? "No milestone"}</span>
              <span className="text-right">{task.progressPercent}% progress</span>
              <span>{formatDate(task.plannedStartAt)} - {formatDate(task.plannedEndAt)}</span>
              <span className="text-right">{formatHours(task.actualHours)} / {formatHours(task.estimatedHours)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildCalendarSections(mode: CalendarMode, anchorValue: string, fromYear: number, toYear: number): CalendarSection[] {
  const anchor = startOfDay(new Date(anchorValue));
  if (mode === "week") {
    return [{ year: anchor.getFullYear(), months: [{ key: `week-${toDateKey(anchor)}`, label: "Week", days: paddedRange(startOfWeek(anchor), addDays(startOfWeek(anchor), 6)) }] }];
  }
  if (mode === "month") {
    return [{ year: anchor.getFullYear(), months: [paddedMonth(anchor.getFullYear(), anchor.getMonth())] }];
  }
  if (mode === "range") {
    const start = Math.min(fromYear, toYear);
    const end = Math.max(fromYear, toYear);
    return Array.from({ length: end - start + 1 }, (_value, index) => buildYearSection(start + index));
  }
  return [buildYearSection(anchor.getFullYear())];
}

function buildYearSection(year: number): CalendarSection {
  return {
    year,
    months: Array.from({ length: 12 }, (_value, month) => paddedMonth(year, month))
  };
}

function paddedMonth(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    key: `${year}-${month}`,
    label: monthLabels[month],
    days: paddedRange(startOfWeek(start), endOfWeek(end), start, end)
  };
}

function paddedRange(start: Date, end: Date, activeStart = start, activeEnd = end) {
  const days: CalendarDay[] = [];
  for (let day = startOfDay(start); day <= end; day = addDays(day, 1)) {
    days.push({ key: toDateKey(day), label: String(day.getDate()), inRange: day >= startOfDay(activeStart) && day <= startOfDay(activeEnd) });
  }
  return days;
}

function uniqueProjects(tasks: WorkloadTask[]) {
  const projects = new Map<string, WorkloadTask["project"]>();
  for (const task of tasks) projects.set(task.project.id, task.project);
  return Array.from(projects.values());
}

const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthFullLabels = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type CalendarDensity = "week" | "month" | "singleYear" | "twoYears" | "manyYears";

function getCalendarDensity(mode: CalendarMode, yearCount: number): CalendarDensity {
  if (mode === "week") return "week";
  if (mode === "month") return "month";
  if (yearCount <= 1) return "singleYear";
  if (yearCount === 2) return "twoYears";
  return "manyYears";
}

function calendarCellSize(density: CalendarDensity) {
  const sizes: Record<CalendarDensity, number> = {
    week: 64,
    month: 72,
    singleYear: 40,
    twoYears: 19,
    manyYears: 16
  };
  return sizes[density];
}

function monthListClass(density: CalendarDensity) {
  if (density === "singleYear") return "grid w-full grid-cols-1 justify-items-center gap-x-10 gap-y-8 lg:grid-cols-2 2xl:grid-cols-3";
  return "flex w-fit flex-col gap-3";
}

function sectionWidthClass(density: CalendarDensity) {
  if (density === "twoYears") return "min-w-[300px]";
  if (density === "manyYears") return "min-w-[260px]";
  return "";
}

function startOfWeek(date: Date) {
  const day = startOfDay(date);
  const offset = (day.getDay() + 6) % 7;
  return addDays(day, -offset);
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
