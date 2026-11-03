import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class VaultService {
  private readonly s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "eu-west-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: requiredEnv("S3_ACCESS_KEY"),
      secretAccessKey: requiredEnv("S3_SECRET_KEY")
    }
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(projectId: string) {
    const items = await this.prisma.vaultItem.findMany({
      where: { projectId, deletedAt: null },
      include: { taskLinks: true, permissions: true },
      orderBy: [{ itemType: "asc" }, { name: "asc" }]
    });
    return items.map(serializeVaultItem);
  }

  async createFolder(projectId: string, actorUserId: string, body: { name: string; parentId?: string | null }) {
    await this.ensureParentFolder(projectId, body.parentId);
    const folder = await this.prisma.vaultItem.create({
      data: {
        projectId,
        parentId: body.parentId || undefined,
        itemType: "folder",
        name: body.name,
        normalizedName: normalizeName(body.name),
        uploadedById: actorUserId
      }
    });
    await this.audit.record({
      projectId,
      actorUserId,
      entityType: "vault_item",
      entityId: folder.id,
      action: "vault.folder_created",
      afterJson: folder
    });
    return serializeVaultItem(folder);
  }

  async uploadFile(projectId: string, actorUserId: string, file: any, body: { parentId?: string | null; taskId?: string }) {
    await this.ensureParentFolder(projectId, body.parentId);
    if (body.taskId) await this.ensureTaskInProject(projectId, body.taskId);
    const bucket = process.env.S3_BUCKET ?? "planner-vault";
    const hash = createHash("sha256").update(file.buffer).digest("hex");
    const extension = file.originalname.includes(".") ? file.originalname.split(".").pop() : "";
    const storageKey = `${projectId}/${Date.now()}-${hash.slice(0, 12)}-${file.originalname}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: { uploadedBy: actorUserId }
      })
    );

    const vaultItem = await this.prisma.vaultItem.create({
      data: {
        projectId,
        parentId: body.parentId || undefined,
        itemType: "file",
        name: file.originalname,
        normalizedName: normalizeName(file.originalname),
        storageKey,
        mimeType: file.mimetype,
        fileExtension: extension,
        sizeBytes: BigInt(file.size),
        hashSha256: hash,
        uploadedById: actorUserId,
        taskLinks: body.taskId
          ? { create: { taskId: body.taskId, relationType: "attachment", linkedById: actorUserId } }
          : undefined
      }
    });

    await this.audit.record({
      projectId,
      actorUserId,
      entityType: "vault_item",
      entityId: vaultItem.id,
      action: "vault.file_uploaded",
      afterJson: { id: vaultItem.id, name: vaultItem.name, sizeBytes: file.size }
    });
    return serializeVaultItem(vaultItem);
  }

  async signedDownloadUrl(vaultItemId: string) {
    const item = await this.prisma.vaultItem.findUnique({ where: { id: vaultItemId } });
    if (!item?.storageKey) throw new NotFoundException("File not found");
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET ?? "planner-vault", Key: item.storageKey }),
      { expiresIn: 60 }
    );
    return { url, expiresInSeconds: 60 };
  }

  async findProjectId(vaultItemId: string) {
    const item = await this.prisma.vaultItem.findUnique({
      where: { id: vaultItemId },
      select: { projectId: true, deletedAt: true }
    });
    if (!item || item.deletedAt) throw new NotFoundException("Item not found");
    return item.projectId;
  }

  async setPermission(vaultItemId: string, actorUserId: string, body: { subjectType: string; subjectId: string; permission: string }) {
    const item = await this.prisma.vaultItem.findUnique({ where: { id: vaultItemId } });
    if (!item) throw new NotFoundException("Item not found");
    const permission = await this.prisma.filePermission.create({
      data: {
        vaultItemId,
        subjectType: body.subjectType as never,
        subjectId: body.subjectId,
        permission: body.permission as never,
        createdById: actorUserId
      }
    });
    await this.audit.record({
      projectId: item.projectId,
      actorUserId,
      entityType: "file_permission",
      entityId: permission.id,
      action: "vault.permission_changed",
      afterJson: permission
    });
    return permission;
  }

  async moveItem(vaultItemId: string, actorUserId: string, body: { parentId?: string | null }) {
    const item = await this.prisma.vaultItem.findUnique({ where: { id: vaultItemId } });
    if (!item || item.deletedAt) throw new NotFoundException("Item not found");

    const parentId = body.parentId || null;
    if (parentId) {
      await this.ensureParentFolder(item.projectId, parentId);
      await this.ensureNotMovingIntoSelfOrDescendant(vaultItemId, parentId);
    }

    const updated = await this.prisma.vaultItem.update({
      where: { id: vaultItemId },
      data: { parentId }
    });

    await this.audit.record({
      projectId: item.projectId,
      actorUserId,
      entityType: "vault_item",
      entityId: updated.id,
      action: "vault.item_moved",
      beforeJson: { id: item.id, parentId: item.parentId },
      afterJson: { id: updated.id, parentId: updated.parentId }
    });

    return serializeVaultItem(updated);
  }

  private async ensureParentFolder(projectId: string, parentId?: string | null) {
    if (!parentId) return;
    const parent = await this.prisma.vaultItem.findUnique({
      where: { id: parentId },
      select: { projectId: true, itemType: true, deletedAt: true }
    });
    if (!parent || parent.deletedAt || parent.projectId !== projectId || parent.itemType !== "folder") {
      throw new BadRequestException("The destination folder does not exist in this project");
    }
  }

  private async ensureTaskInProject(projectId: string, taskId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!task || task.projectId !== projectId) {
      throw new BadRequestException("The task does not belong to the project");
    }
  }

  private async ensureNotMovingIntoSelfOrDescendant(vaultItemId: string, targetParentId: string) {
    let currentParentId: string | null = targetParentId;
    while (currentParentId) {
      if (currentParentId === vaultItemId) {
        throw new BadRequestException("A folder cannot be moved into itself");
      }
      const parent: { parentId: string | null } | null = await this.prisma.vaultItem.findUnique({
        where: { id: currentParentId },
        select: { parentId: true }
      });
      currentParentId = parent?.parentId ?? null;
    }
  }
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_");
}

function serializeVaultItem<T extends { sizeBytes?: bigint | number | string | null }>(item: T) {
  return {
    ...item,
    sizeBytes: item.sizeBytes === null || item.sizeBytes === undefined ? null : item.sizeBytes.toString()
  };
}
