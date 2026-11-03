import { Badge } from "@/components/ui/badge";

const labelMap: Record<string, string> = {
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

export function TaskStatusBadge({ status }: { status: string }) {
  const variant = status === "blocked" || status === "rejected" ? "danger" : status === "done" || status === "accepted" ? "success" : status === "in_progress" || status === "paused" ? "warning" : "outline";
  return <Badge variant={variant}>{labelMap[status] ?? status}</Badge>;
}
