import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/modules/admin/admin.service";

function serviceWithActiveUserCount(count: number) {
  const prisma = {
    user: {
      count: vi.fn().mockResolvedValue(count)
    }
  };
  return {
    service: new AdminService(prisma as never),
    prisma
  };
}

describe("admin setup", () => {
  it("marks a fresh instance as needing the first admin", async () => {
    const { service } = serviceWithActiveUserCount(0);
    await expect(service.setupStatus()).resolves.toEqual({ needsFirstAdmin: true });
  });

  it("blocks first-admin creation once a user exists", async () => {
    const { service } = serviceWithActiveUserCount(1);
    await expect(service.createFirstAdmin({})).rejects.toBeInstanceOf(BadRequestException);
  });
});
