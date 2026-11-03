ALTER TABLE "Task" ADD COLUMN "sortOrder" INTEGER;

WITH ranked_tasks AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "projectId"
      ORDER BY
        CASE "priority"
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        "plannedStartAt" ASC NULLS LAST,
        "createdAt" ASC
    ) - 1 AS "nextSortOrder"
  FROM "Task"
)
UPDATE "Task"
SET "sortOrder" = ranked_tasks."nextSortOrder"
FROM ranked_tasks
WHERE "Task"."id" = ranked_tasks."id";

ALTER TABLE "Task" ALTER COLUMN "sortOrder" SET DEFAULT 0;
ALTER TABLE "Task" ALTER COLUMN "sortOrder" SET NOT NULL;

CREATE INDEX "Task_projectId_sortOrder_idx" ON "Task"("projectId", "sortOrder");
