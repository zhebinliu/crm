// ─── ListViewService ───────────────────────────────────────────────────────
// Per-user filter+sort presets (Salesforce "List Views"). Each user sees
// their own views plus any views their colleagues marked isShared=true.
// One view per user per object can be marked isDefault — the list page
// loads it on first visit.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateListViewInput {
  objectApiName: string;
  name: string;
  filters: Record<string, unknown>;
  sortBy?: string | null;
  sortDir?: 'asc' | 'desc' | null;
  isShared?: boolean;
  isDefault?: boolean;
}

export interface UpdateListViewInput {
  name?: string;
  filters?: Record<string, unknown>;
  sortBy?: string | null;
  sortDir?: 'asc' | 'desc' | null;
  isShared?: boolean;
  isDefault?: boolean;
}

@Injectable()
export class ListViewService {
  constructor(private readonly prisma: PrismaService) {}

  /** All views the user can see for the object: their own + tenant-shared. */
  async listForUser(tenantId: string, userId: string, objectApiName: string) {
    return this.prisma.listView.findMany({
      where: {
        tenantId,
        objectApiName,
        OR: [{ ownerId: userId }, { isShared: true }],
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
      include: {
        owner: { select: { id: true, displayName: true } },
      },
    });
  }

  async get(tenantId: string, userId: string, id: string) {
    const view = await this.prisma.listView.findFirst({
      where: {
        id,
        tenantId,
        OR: [{ ownerId: userId }, { isShared: true }],
      },
    });
    if (!view) throw new NotFoundException(`ListView ${id} not found or not accessible`);
    return view;
  }

  async create(tenantId: string, userId: string, input: CreateListViewInput) {
    if (input.isDefault) {
      // Clear any prior default for this user+object combo first.
      await this.prisma.listView.updateMany({
        where: { tenantId, ownerId: userId, objectApiName: input.objectApiName, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.listView.create({
      data: {
        tenantId,
        ownerId: userId,
        objectApiName: input.objectApiName,
        name: input.name.slice(0, 100),
        filters: (input.filters ?? {}) as object,
        sortBy: input.sortBy ?? null,
        sortDir: input.sortDir ?? null,
        isShared: input.isShared ?? false,
        isDefault: input.isDefault ?? false,
      },
    });
  }

  async update(tenantId: string, userId: string, id: string, input: UpdateListViewInput) {
    // Owners only — can't edit someone else's shared view.
    const existing = await this.prisma.listView.findFirst({
      where: { id, tenantId, ownerId: userId },
    });
    if (!existing) throw new NotFoundException(`ListView ${id} not found or you don't own it`);

    if (input.isDefault === true) {
      await this.prisma.listView.updateMany({
        where: { tenantId, ownerId: userId, objectApiName: existing.objectApiName, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.listView.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: input.name.slice(0, 100) } : {}),
        ...(input.filters != null ? { filters: input.filters as object } : {}),
        ...(input.sortBy !== undefined ? { sortBy: input.sortBy } : {}),
        ...(input.sortDir !== undefined ? { sortDir: input.sortDir } : {}),
        ...(input.isShared != null ? { isShared: input.isShared } : {}),
        ...(input.isDefault != null ? { isDefault: input.isDefault } : {}),
      },
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    const existing = await this.prisma.listView.findFirst({
      where: { id, tenantId, ownerId: userId },
    });
    if (!existing) throw new NotFoundException(`ListView ${id} not found or you don't own it`);
    await this.prisma.listView.delete({ where: { id } });
  }
}
