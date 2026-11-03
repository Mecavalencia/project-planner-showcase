import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    projectId?: string;
    actorUserId?: string;
    entityType: string;
    entityId: string;
    action: string;
    beforeJson?: unknown;
    afterJson?: unknown;
  }) {
    return this.prisma.auditEvent.create({
      data: {
        projectId: input.projectId,
        actorUserId: input.actorUserId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        beforeJson: input.beforeJson === undefined ? undefined : (input.beforeJson as object),
        afterJson: input.afterJson === undefined ? undefined : (input.afterJson as object)
      }
    });
  }
}
