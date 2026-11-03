"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface GanttTask {
  id: string;
  type?: "task" | "milestone";
  milestoneId?: string | null;
  name: string;
  start?: string;
  end?: string;
  progress: number;
  custom_class?: string;
  status?: string;
  priority?: "low" | "medium" | "high" | "critical";
  sortOrder?: number;
  responsible?: string;
  timeProgress?: number;
  taskCount?: number;
}

type DatedGanttTask = GanttTask & { start: string; end: string };
type OrderMode = "manual" | "priority" | "date";

interface ResizeState {
  taskId: string;
  edge: "start" | "end";
  originX: number;
  initialStart: string;
  initialEnd: string;
  dayWidth: number;
}

export function GanttPanel({ projectId, accessToken, onChanged }: { projectId: string; accessToken: string; onChanged: () => void }) {
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [status, setStatus] = useState("Loading Gantt...");
  const [orderMode, setOrderMode] = useState<OrderMode>("manual");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  async function loadGantt() {
    const nextTasks = await apiFetch<GanttTask[]>(`/projects/${projectId}/gantt`, accessToken);
    setTasks(nextTasks);
    setStatus(nextTasks.some((task) => task.start && task.end) ? "" : "No dated tasks to display.");
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const nextTasks = await apiFetch<GanttTask[]>(`/projects/${projectId}/gantt`, accessToken);
        if (!mounted) return;
        setTasks(nextTasks);
        setStatus(nextTasks.some((task) => task.start && task.end) ? "" : "No dated tasks to display.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not load the Gantt chart");
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [accessToken, projectId]);

  const datedTasks = useMemo(
    () => tasks.filter((task): task is DatedGanttTask => Boolean(task.start && task.end)),
    [tasks]
  );

  const visibleTasks = useMemo(() => {
    const next = [...datedTasks];
    const milestoneOrder = new Map(next.filter((task) => task.type === "milestone").map((task) => [task.id, task.sortOrder ?? 0]));
    if (orderMode === "priority") {
      return next.sort((a, b) => typeWeight(a) - typeWeight(b) || priorityWeight(b.priority) - priorityWeight(a.priority) || compareDates(a.start, b.start) || compareStrings(a.name, b.name));
    }
    if (orderMode === "date") {
      return next.sort((a, b) => compareDates(a.start, b.start) || typeWeight(a) - typeWeight(b) || priorityWeight(b.priority) - priorityWeight(a.priority) || compareStrings(a.name, b.name));
    }
    return next.sort((a, b) => manualGroupOrder(a, milestoneOrder) - manualGroupOrder(b, milestoneOrder) || typeWeight(a) - typeWeight(b) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || priorityWeight(b.priority) - priorityWeight(a.priority) || compareDates(a.start, b.start));
  }, [datedTasks, orderMode]);

  const range = useMemo(() => getRange(visibleTasks), [visibleTasks]);

  useEffect(() => {
    if (!resizeState) return;
    const activeResize = resizeState;

    function handlePointerMove(event: PointerEvent) {
      const nextDates = getResizeDates(activeResize, event.clientX);
      setTasks((current) => updateTaskDates(current, activeResize.taskId, nextDates.start, nextDates.end));
    }

    function handlePointerUp(event: PointerEvent) {
      const nextDates = getResizeDates(activeResize, event.clientX);
      setResizeState(null);
      commitTaskSchedule(activeResize.taskId, nextDates.start, nextDates.end);
    }

    document.body.style.cursor = "ew-resize";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [resizeState]);

  async function commitTaskSchedule(taskId: string, start: string, end: string) {
    setStatus("Saving schedule...");
    try {
      await apiFetch(`/tasks/${taskId}/schedule`, accessToken, {
        method: "PATCH",
        body: JSON.stringify({ plannedStartAt: new Date(start).toISOString(), plannedEndAt: new Date(end).toISOString() })
      });
      await onChanged();
      await loadGantt();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save the schedule");
      await loadGantt().catch(() => undefined);
    }
  }

  async function moveTaskBefore(targetTaskId: string) {
    const reorderableTasks = visibleTasks.filter((task) => task.type !== "milestone");
    if (!draggedTaskId || draggedTaskId === targetTaskId) return;
    const fromIndex = reorderableTasks.findIndex((task) => task.id === draggedTaskId);
    const toIndex = reorderableTasks.findIndex((task) => task.id === targetTaskId);
    if (fromIndex < 0 || toIndex < 0) return;

    const nextTasks = [...reorderableTasks];
    const [movedTask] = nextTasks.splice(fromIndex, 1);
    nextTasks.splice(toIndex, 0, movedTask);
    setOrderMode("manual");
    setTasks((current) => applyManualOrder(current, nextTasks.map((task) => task.id)));
    setDraggedTaskId(null);
    setStatus("Saving order...");
    try {
      await apiFetch(`/projects/${projectId}/tasks/order`, accessToken, {
        method: "PATCH",
        body: JSON.stringify({ taskIds: nextTasks.map((task) => task.id) })
      });
      await onChanged();
      await loadGantt();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save the order");
      await loadGantt().catch(() => undefined);
    }
  }

  function beginResize(event: React.PointerEvent<HTMLDivElement>, task: DatedGanttTask, edge: "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const track = event.currentTarget.closest("[data-gantt-track]");
    if (!(track instanceof HTMLElement)) return;
    const width = Math.max(1, track.getBoundingClientRect().width);
    setResizeState({
      taskId: task.id,
      edge,
      originX: event.clientX,
      initialStart: task.start,
      initialEnd: task.end,
      dayWidth: width / Math.max(1, range.days)
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : <p className="text-sm text-muted-foreground">Manual Gantt ordering is active.</p>}
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Order</span>
          <select className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={orderMode} onChange={(event) => setOrderMode(event.target.value as OrderMode)}>
            <option value="manual">Manual</option>
            <option value="priority">Priority</option>
            <option value="date">Date</option>
          </select>
        </label>
      </div>
      {visibleTasks.length === 0 ? null : (
        <div className="overflow-x-auto rounded-lg border border-border bg-background p-4">
          <div className="min-w-[960px]">
            <div className="grid grid-cols-[300px_1fr_170px] items-center gap-3 border-b border-border pb-3 text-xs font-medium uppercase text-muted-foreground">
                  <span>Task / Milestone</span>
              <div className="grid grid-cols-6">
                {range.ticks.map((tick) => (
                  <span key={tick.toISOString()}>{formatDate(tick)}</span>
                ))}
              </div>
              <span>Plan</span>
            </div>
            <div className="flex flex-col">
              {visibleTasks.map((task) => {
                const startOffset = daysBetween(range.start, new Date(task.start));
                const duration = Math.max(1, daysBetween(new Date(task.start), new Date(task.end)) + 1);
                const left = (startOffset / range.days) * 100;
                const width = Math.min(100 - left, (duration / range.days) * 100);
                const isMilestone = task.type === "milestone";
                const isDropTarget = draggedTaskId !== null && draggedTaskId !== task.id && !isMilestone;
                return (
                  <div
                    key={task.id}
                    data-testid="gantt-row"
                    data-task-id={task.id}
                    className={`grid grid-cols-[300px_1fr_170px] items-center gap-3 border-b border-border py-3 transition-colors ${isDropTarget ? "bg-primary/5" : ""}`}
                    onDragOver={(event) => {
                      if (draggedTaskId && !isMilestone) event.preventDefault();
                    }}
                    onDrop={() => !isMilestone && moveTaskBefore(task.id)}
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      {isMilestone ? (
                        <div className="flex size-9 items-center justify-center text-primary">◆</div>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          data-testid="gantt-drag-handle"
                          draggable={orderMode === "manual"}
                          aria-label={`Move ${task.name}`}
                          onDragStart={() => setDraggedTaskId(task.id)}
                          onDragEnd={() => setDraggedTaskId(null)}
                        >
                          <GripVertical className="size-4" />
                        </Button>
                      )}
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">{task.name}</p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {isMilestone ? <Badge>Milestone</Badge> : <Badge variant={task.status === "in_progress" || task.status === "paused" ? "warning" : task.status === "done" ? "success" : "outline"}>{statusLabel(task.status)}</Badge>}
                          {isMilestone ? <Badge variant="outline">{task.taskCount ?? 0} tasks</Badge> : <Badge variant={priorityBadgeVariant(task.priority)}>{priorityLabel(task.priority)}</Badge>}
                          {task.responsible && !isMilestone ? <Badge>{task.responsible}</Badge> : null}
                        </div>
                      </div>
                    </div>
                    <div className="relative h-12 rounded-md bg-muted" data-gantt-track>
                      <div
                        className={`absolute overflow-hidden border shadow-soft ${
                          isMilestone
                            ? "top-5 h-2 rounded-full border-[#5f9ea0]/45 bg-[#b8d7d8]"
                            : "top-2 h-8 rounded-md border-[#5f9ea0]/45 bg-[#b8d7d8]"
                        }`}
                        style={{ left: `${left}%`, width: `${Math.max(width, 4)}%` }}
                        title={`${task.name}: ${task.start} - ${task.end} · ${clampProgress(task.progress)}%`}
                      >
                        <div
                          className={`h-full transition-[width] ${
                            isMilestone
                              ? "rounded-full bg-success"
                              : "rounded-md bg-success shadow-[inset_0_0_0_1px_rgba(255,255,255,0.26)]"
                          }`}
                          style={{ width: `${clampProgress(task.progress)}%` }}
                        />
                        {!isMilestone ? (
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-2 text-[11px] font-semibold text-foreground/80">
                            {clampProgress(task.progress)}%
                          </span>
                        ) : null}
                        {isMilestone ? <div className="absolute right-[-6px] top-[-5px] h-4 w-4 rotate-45 rounded-[2px] bg-success" /> : null}
                        {!isMilestone ? (
                          <>
                            <div
                              data-testid="gantt-resize-start"
                              className="absolute left-0 top-0 h-full w-3 cursor-ew-resize rounded-l-md bg-primary/35 opacity-70 hover:opacity-100"
                              role="button"
                              aria-label={`Move start of ${task.name}`}
                              onPointerDown={(event) => beginResize(event, task, "start")}
                            />
                            <div
                              data-testid="gantt-resize-end"
                              className="absolute right-0 top-0 h-full w-3 cursor-ew-resize rounded-r-md bg-primary/35 opacity-70 hover:opacity-100"
                              role="button"
                              aria-label={`Change end of ${task.name}`}
                              onPointerDown={(event) => beginResize(event, task, "end")}
                            />
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>{formatDate(task.start)}</p>
                      <p>{formatDate(task.end)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getRange(tasks: DatedGanttTask[]) {
  if (tasks.length === 0) {
    const start = startOfDay(new Date());
    const end = addDays(start, 30);
    return { start, end, days: 30, ticks: [start, addDays(start, 6), addDays(start, 12), addDays(start, 18), addDays(start, 24), end] };
  }
  const starts = tasks.map((task) => new Date(task.start).getTime());
  const ends = tasks.map((task) => new Date(task.end).getTime());
  const start = startOfDay(new Date(Math.min(...starts)));
  const end = startOfDay(new Date(Math.max(...ends)));
  start.setDate(start.getDate() - 3);
  end.setDate(end.getDate() + 7);
  const days = Math.max(1, daysBetween(start, end));
  const ticks = Array.from({ length: 6 }, (_value, index) => addDays(start, Math.round((days / 5) * index)));
  return { start, end, days, ticks };
}

function getResizeDates(state: ResizeState, clientX: number) {
  const deltaDays = Math.round((clientX - state.originX) / state.dayWidth);
  const initialStart = new Date(state.initialStart);
  const initialEnd = new Date(state.initialEnd);
  if (state.edge === "start") {
    const nextStart = addDays(initialStart, deltaDays);
    return { start: toDateOnly(nextStart > initialEnd ? initialEnd : nextStart), end: state.initialEnd };
  }
  const nextEnd = addDays(initialEnd, deltaDays);
  return { start: state.initialStart, end: toDateOnly(nextEnd < initialStart ? initialStart : nextEnd) };
}

function updateTaskDates(tasks: GanttTask[], taskId: string, start: string, end: string) {
  return tasks.map((task) => (task.id === taskId ? { ...task, start, end } : task));
}

function applyManualOrder(tasks: GanttTask[], taskIds: string[]) {
  const order = new Map(taskIds.map((taskId, index) => [taskId, index]));
  return tasks.map((task) => (order.has(task.id) ? { ...task, sortOrder: order.get(task.id) } : task));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function daysBetween(start: Date, end: Date) {
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86_400_000);
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function compareDates(left: string, right: string) {
  return new Date(left).getTime() - new Date(right).getTime();
}

function compareStrings(left: string, right: string) {
  return left.localeCompare(right);
}

function priorityWeight(priority?: string) {
  const weights: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  return priority ? weights[priority] ?? 1 : 1;
}

function typeWeight(task: GanttTask) {
  return task.type === "milestone" ? 0 : 1;
}

function manualGroupOrder(task: GanttTask, milestoneOrder: Map<string, number>) {
  if (task.type === "milestone") return task.sortOrder ?? 0;
  if (task.milestoneId && milestoneOrder.has(task.milestoneId)) return milestoneOrder.get(task.milestoneId)!;
  return 10_000 + (task.sortOrder ?? 0);
}

function priorityLabel(priority?: string) {
  const labels: Record<string, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
    critical: "Critical"
  };
  return priority ? labels[priority] ?? priority : "Medium";
}

function priorityBadgeVariant(priority?: string) {
  if (priority === "critical" || priority === "high") return "warning";
  if (priority === "low") return "outline";
  return "default";
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    planned: "Planned",
    should_start: "Should start",
    in_progress: "In progress",
    paused: "Paused",
    blocked: "Blocked",
    in_review: "In review",
    done: "Completed",
    accepted: "Accepted",
    rejected: "Rejected",
    cancelled: "Cancelled"
  };
  return status ? labels[status] ?? status : "No status";
}

function clampProgress(progress?: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress ?? 0)));
}
