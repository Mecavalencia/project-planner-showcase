ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';

UPDATE "User"
SET "username" = split_part("email", '@', 1)
WHERE "username" IS NULL;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

ALTER TABLE "Project" ADD COLUMN "color" TEXT NOT NULL DEFAULT '#6f9fc8';

UPDATE "Project"
SET "color" = palette.color
FROM (
  SELECT id, (ARRAY['#6f9fc8', '#8ca77b', '#d19a66', '#9a89b8', '#c9847a', '#79a7a8'])[1 + ((row_number() OVER (ORDER BY "createdAt"))::int - 1) % 6] AS color
  FROM "Project"
) AS palette
WHERE "Project".id = palette.id;

CREATE TABLE "Milestone" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "plannedStartAt" TIMESTAMP(3),
  "plannedEndAt" TIMESTAMP(3),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Milestone_projectId_sortOrder_idx" ON "Milestone"("projectId", "sortOrder");

ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Task" ADD COLUMN "milestoneId" TEXT;
CREATE INDEX "Task_milestoneId_idx" ON "Task"("milestoneId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_milestoneId_fkey"
FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MilestoneFile" (
  "id" TEXT NOT NULL,
  "milestoneId" TEXT NOT NULL,
  "vaultItemId" TEXT NOT NULL,
  "linkedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MilestoneFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MilestoneFile_milestoneId_vaultItemId_key" ON "MilestoneFile"("milestoneId", "vaultItemId");

ALTER TABLE "MilestoneFile" ADD CONSTRAINT "MilestoneFile_milestoneId_fkey"
FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MilestoneFile" ADD CONSTRAINT "MilestoneFile_vaultItemId_fkey"
FOREIGN KEY ("vaultItemId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
