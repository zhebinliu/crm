// ─── PublicGroupService ────────────────────────────────────────────────────
//
// Salesforce-style Public Groups: a named tenant-scoped collection of users
// (directly, or transitively via Role membership). Used as a share grantee
// on RecordShare and as the membership pool of a Queue. v1 keeps it 2-level
// (User + Role only); a future iteration adds nested-group members.

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateGroupDto {
  apiName: string;
  label: string;
  description?: string | null;
  isActive?: boolean;
}

export interface UpdateGroupDto {
  label?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface AddMemberDto {
  userId?: string | null;
  roleId?: string | null;
}

@Injectable()
export class PublicGroupService {
  private readonly log = new Logger(PublicGroupService.name);

  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.publicGroup.findMany({
      where: { tenantId },
      orderBy: { apiName: 'asc' },
      include: { _count: { select: { members: true } } },
    });
  }

  async get(tenantId: string, id: string) {
    const g = await this.prisma.publicGroup.findFirst({
      where: { id, tenantId },
      include: {
        members: {
          include: {
            // user / role joins are best-effort; not all members have one set
          },
        },
      },
    });
    if (!g) throw new NotFoundException('Public group not found');
    return g;
  }

  create(tenantId: string, dto: CreateGroupDto) {
    return this.prisma.publicGroup.create({
      data: {
        tenantId,
        apiName: dto.apiName,
        label: dto.label,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateGroupDto) {
    const existing = await this.prisma.publicGroup.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Public group not found');
    return this.prisma.publicGroup.update({
      where: { id },
      data: {
        label: dto.label ?? existing.label,
        description: dto.description === undefined ? existing.description : dto.description,
        isActive: dto.isActive ?? existing.isActive,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.publicGroup.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Public group not found');
    await this.prisma.publicGroup.delete({ where: { id } });
  }

  async addMember(tenantId: string, groupId: string, dto: AddMemberDto) {
    if (!dto.userId && !dto.roleId) {
      throw new BadRequestException('Either userId or roleId is required');
    }
    if (dto.userId && dto.roleId) {
      throw new BadRequestException('A member is either userId OR roleId, not both');
    }
    const group = await this.prisma.publicGroup.findFirst({ where: { id: groupId, tenantId } });
    if (!group) throw new NotFoundException('Public group not found');
    return this.prisma.publicGroupMember.create({
      data: {
        groupId,
        userId: dto.userId ?? null,
        roleId: dto.roleId ?? null,
      },
    });
  }

  async removeMember(tenantId: string, groupId: string, memberId: string) {
    const member = await this.prisma.publicGroupMember.findFirst({
      where: { id: memberId, group: { id: groupId, tenantId } },
    });
    if (!member) throw new NotFoundException('Group member not found');
    await this.prisma.publicGroupMember.delete({ where: { id: memberId } });
  }

  /**
   * Recursively expand a public group to the set of user IDs that are
   * effectively members. v1 walks: direct user members + every user with a
   * UserRole in any role member. (No nested group support yet.)
   */
  async expandToUserIds(groupId: string): Promise<Set<string>> {
    const members = await this.prisma.publicGroupMember.findMany({
      where: { groupId },
      select: { userId: true, roleId: true },
    });
    const userIds = new Set<string>();
    const roleIds: string[] = [];
    for (const m of members) {
      if (m.userId) userIds.add(m.userId);
      if (m.roleId) roleIds.push(m.roleId);
    }
    if (roleIds.length > 0) {
      const userRoles = await this.prisma.userRole.findMany({
        where: { roleId: { in: roleIds } },
        select: { userId: true },
      });
      for (const ur of userRoles) userIds.add(ur.userId);
    }
    return userIds;
  }

  /**
   * Inverse: groups (active) the user is a member of, including via role.
   * Used by SharingService.whereVisible to OR-in group-grantee shares.
   */
  async groupsForUser(tenantId: string, userId: string): Promise<string[]> {
    const direct = await this.prisma.publicGroupMember.findMany({
      where: { userId, group: { tenantId, isActive: true } },
      select: { groupId: true },
    });
    const roles = await this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });
    const roleIds = roles.map((r) => r.roleId);
    let viaRole: { groupId: string }[] = [];
    if (roleIds.length > 0) {
      viaRole = await this.prisma.publicGroupMember.findMany({
        where: {
          roleId: { in: roleIds },
          group: { tenantId, isActive: true },
        },
        select: { groupId: true },
      });
    }
    const out = new Set<string>([...direct.map((m) => m.groupId), ...viaRole.map((m) => m.groupId)]);
    return Array.from(out);
  }
}
