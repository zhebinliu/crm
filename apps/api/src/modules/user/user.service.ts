import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
  title?: string;
  department?: string;
  managerId?: string;
  roleCodes?: string[];
}

export interface UpdateUserInput {
  displayName?: string;
  phone?: string;
  title?: string;
  department?: string;
  managerId?: string | null;
  isActive?: boolean;
  roleCodes?: string[];
}

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  list(tenantId: string, q?: { search?: string; isActive?: boolean }) {
    return this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isActive: q?.isActive,
        OR: q?.search
          ? [
              { email: { contains: q.search, mode: 'insensitive' } },
              { displayName: { contains: q.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(tenantId: string, id: string) {
    const u = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { roles: { include: { role: true } }, manager: true },
    });
    if (!u) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    return u;
  }

  async create(tenantId: string, input: CreateUserInput) {
    const passwordHash = await this.auth.hashPassword(input.password);
    const roleCodes = input.roleCodes ?? [];
    const roles = await this.prisma.role.findMany({
      where: { tenantId, code: { in: roleCodes } },
    });
    if (roles.length !== roleCodes.length) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'One or more roles not found' });
    }
    return this.prisma.user.create({
      data: {
        tenantId,
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        phone: input.phone,
        title: input.title,
        department: input.department,
        managerId: input.managerId,
        roles: {
          create: roles.map((r) => ({ roleId: r.id })),
        },
      },
      include: { roles: { include: { role: true } } },
    });
  }

  async update(tenantId: string, id: string, input: UpdateUserInput) {
    const existing = await this.get(tenantId, id);
    const data: Record<string, unknown> = {};
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.title !== undefined) data.title = input.title;
    if (input.department !== undefined) data.department = input.department;
    if (input.managerId !== undefined) data.managerId = input.managerId;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    if (input.roleCodes) {
      const roles = await this.prisma.role.findMany({
        where: { tenantId, code: { in: input.roleCodes } },
      });
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      await this.prisma.userRole.createMany({
        data: roles.map((r) => ({ userId: id, roleId: r.id })),
      });
    }

    await this.prisma.user.update({ where: { id: existing.id }, data });
    return this.get(tenantId, id);
  }

  async softDelete(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { ok: true };
  }
}
