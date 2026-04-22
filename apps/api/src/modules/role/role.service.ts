import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId },
      include: { permissions: { include: { permission: true } } },
      orderBy: { code: 'asc' },
    });
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ object: 'asc' }, { action: 'asc' }] });
  }

  async create(tenantId: string, input: { name: string; code: string; description?: string; permissionCodes?: string[] }) {
    const existing = await this.prisma.role.findUnique({
      where: { tenantId_code: { tenantId, code: input.code } },
    });
    if (existing) throw new BadRequestException({ code: 'CONFLICT', message: 'Role code already exists' });

    const perms = input.permissionCodes?.length
      ? await this.prisma.permission.findMany({ where: { code: { in: input.permissionCodes } } })
      : [];

    return this.prisma.role.create({
      data: {
        tenantId,
        name: input.name,
        code: input.code,
        description: input.description,
        permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
      },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async updatePermissions(tenantId: string, roleId: string, permissionCodes: string[]) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, tenantId } });
    if (!role) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Role not found' });

    const perms = await this.prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
    await this.prisma.rolePermission.deleteMany({ where: { roleId } });
    await this.prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId, permissionId: p.id })),
    });
    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
  }

  async remove(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, tenantId } });
    if (!role) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Role not found' });
    if (role.isSystem) throw new BadRequestException({ code: 'CONFLICT', message: 'Cannot delete system role' });
    await this.prisma.role.delete({ where: { id: roleId } });
    return { ok: true };
  }
}
