import * as React from "react";
import { cn } from "@/lib/utils";

const variants: Record<string, string> = {
  default: "bg-muted text-foreground",
  success: "bg-success/12 text-success",
  warning: "bg-warning/16 text-foreground",
  danger: "bg-danger/12 text-danger",
  outline: "border border-border bg-transparent text-muted-foreground"
};

export function Badge({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof variants }) {
  return <span className={cn("inline-flex items-center rounded-md px-2 py-1 text-xs font-medium", variants[variant], className)} {...props} />;
}
