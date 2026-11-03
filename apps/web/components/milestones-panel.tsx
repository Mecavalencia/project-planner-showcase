"use client";

import { FormEvent, useEffect, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { Milestone, Project } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

export function MilestonesPanel({ project, accessToken, onChanged }: { project: Project; accessToken: string; onChanged: () => void }) {
  const [milestones, setMilestones] = useState<Milestone[]>(project.milestones ?? []);
  const [selectedId, setSelectedId] = useState(project.milestones?.[0]?.id ?? "");
  const [message, setMessage] = useState("");

  async function loadMilestones() {
    const next = await apiFetch<Milestone[]>(`/projects/${project.id}/milestones`, accessToken);
    setMilestones(next);
    setSelectedId((current) => current && next.some((milestone) => milestone.id === current) ? current : next[0]?.id ?? "");
  }

  useEffect(() => {
    let mounted = true;
    apiFetch<Milestone[]>(`/projects/${project.id}/milestones`, accessToken)
      .then((next) => {
        if (!mounted) return;
        setMilestones(next);
        setSelectedId((current) => current && next.some((milestone) => milestone.id === current) ? current : next[0]?.id ?? "");
      })
      .catch((error) => {
        if (mounted) setMessage(error instanceof Error ? error.message : "Could not load milestones");
      });
    return () => {
      mounted = false;
    };
  }, [accessToken, project.id]);

  async function createMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await apiFetch(`/projects/${project.id}/milestones`, accessToken, {
      method: "POST",
      body: JSON.stringify({
        name: data.get("name"),
        description: data.get("description"),
        plannedStartAt: data.get("plannedStartAt") ? `${data.get("plannedStartAt")}T08:00:00.000Z` : null,
        plannedEndAt: data.get("plannedEndAt") ? `${data.get("plannedEndAt")}T16:00:00.000Z` : null
      })
    });
    form.reset();
    await Promise.all([loadMilestones(), onChanged()]);
  }

  const selected = milestones.find((milestone) => milestone.id === selectedId) ?? milestones[0] ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>New milestone</CardTitle>
          <CardDescription>Define deliverables or key project checkpoints.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={createMilestone}>
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input name="name" required />
            </Field>
            <Field>
              <FieldLabel>Description</FieldLabel>
              <Textarea name="description" />
            </Field>
            <Field>
              <FieldLabel>Planned start</FieldLabel>
              <Input name="plannedStartAt" type="date" />
            </Field>
            <Field>
              <FieldLabel>Planned end</FieldLabel>
              <Input name="plannedEndAt" type="date" />
            </Field>
            <Button type="submit">
              <Plus data-icon="inline-start" />
              Create milestone
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
            <CardDescription>{milestones.length} active milestones.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {message ? <p className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{message}</p> : null}
            {milestones.map((milestone) => (
              <button key={milestone.id} className={`rounded-md border p-3 text-left ${selected?.id === milestone.id ? "border-primary bg-primary/8" : "border-border"}`} onClick={() => setSelectedId(milestone.id)}>
                <p className="font-medium">{milestone.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(milestone.resolvedStartAt ?? milestone.plannedStartAt)} - {formatDate(milestone.resolvedEndAt ?? milestone.plannedEndAt)}</p>
                <Progress className="mt-3" value={milestone.progressPercent ?? 0} />
                <p className="mt-1 text-xs text-muted-foreground">{milestone.progressPercent ?? 0}% effective progress</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {selected ? <MilestoneDetail milestone={selected} project={project} accessToken={accessToken} reload={async () => { await loadMilestones(); await onChanged(); }} /> : (
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>Select or create a milestone.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}

function MilestoneDetail({ milestone, project, accessToken, reload }: { milestone: Milestone; project: Project; accessToken: string; reload: () => Promise<void> }) {
  async function updateMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await apiFetch(`/milestones/${milestone.id}`, accessToken, {
      method: "PATCH",
      body: JSON.stringify({
        name: data.get("name"),
        description: data.get("description"),
        plannedStartAt: data.get("plannedStartAt") ? `${data.get("plannedStartAt")}T08:00:00.000Z` : null,
        plannedEndAt: data.get("plannedEndAt") ? `${data.get("plannedEndAt")}T16:00:00.000Z` : null
      })
    });
    await reload();
  }

  async function linkFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const vaultItemId = data.get("vaultItemId");
    if (!vaultItemId) return;
    await apiFetch(`/milestones/${milestone.id}/files`, accessToken, { method: "POST", body: JSON.stringify({ vaultItemId }) });
    await reload();
  }

  const files = (project.vaultItems ?? []).filter((item) => item.itemType === "file");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>{milestone.name}</CardTitle>
            <CardDescription>{milestone.description || "No description"}</CardDescription>
          </div>
          <Badge variant="outline">{milestone.tasks?.length ?? 0} tasks</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-sm font-medium">Effective progress</p>
            <Progress className="mt-3" value={milestone.progressPercent ?? 0} />
            <p className="mt-2 text-sm text-muted-foreground">{milestone.progressPercent ?? 0}% from tasks</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-sm font-medium">Time progress</p>
            <Progress className="mt-3" value={milestone.timeProgressPercent ?? 0} />
            <p className="mt-2 text-sm text-muted-foreground">{milestone.timeProgressPercent ?? 0}% by schedule</p>
          </div>
        </div>

        <form className="grid gap-3 md:grid-cols-2" onSubmit={updateMilestone}>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input name="name" defaultValue={milestone.name} required />
          </Field>
          <Field>
            <FieldLabel>Start</FieldLabel>
            <Input name="plannedStartAt" type="date" defaultValue={toDateInput(milestone.plannedStartAt)} />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel>Description</FieldLabel>
            <Textarea name="description" defaultValue={milestone.description} />
          </Field>
          <Field>
            <FieldLabel>End</FieldLabel>
            <Input name="plannedEndAt" type="date" defaultValue={toDateInput(milestone.plannedEndAt)} />
          </Field>
          <Button type="submit">Save milestone</Button>
        </form>

        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium">Milestone tasks</p>
          {(milestone.tasks ?? []).map((task) => (
            <div key={task.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{task.title}</p>
                <Badge variant="outline">{task.progressPercent}%</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(task.plannedStartAt)} - {formatDate(task.plannedEndAt)}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">Milestone documents</p>
            <p className="text-xs text-muted-foreground">Includes manually linked files and files attached to milestone tasks.</p>
          </div>
          <form className="flex flex-col gap-2 md:flex-row" onSubmit={linkFile}>
            <select name="vaultItemId" className="h-10 rounded-md border border-border bg-background px-3 text-sm md:min-w-80">
              <option value="">Link a Vault file</option>
              {files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
            </select>
            <Button type="submit">
              <FileText data-icon="inline-start" />
              Assign
            </Button>
          </form>
          <div className="grid gap-2 md:grid-cols-2">
            {(milestone.documents ?? []).map((document) => (
              <div key={document.id} className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">{document.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{document.itemType}</p>
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}
