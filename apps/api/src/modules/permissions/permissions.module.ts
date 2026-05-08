// ─── PermissionsModule (Wave 19d) ────────────────────────────────────────
// Wires the Profile + Permission Set services + admin REST surface.
//
// On boot: seeds the three default profiles (system_administrator,
// standard_user, minimum_access_user) for every tenant that doesn't
// already have any profiles.
//
// Exported services: PermissionResolverService (used by AuthService to
// build the JWT permission array), ProfileService, PermissionSetService.

import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { PermissionResolverService } from './permission-resolver.service';
import { ProfileService } from './profile.service';
import { PermissionSetService } from './permission-set.service';
import { ProfileController } from './profile.controller';
import {
  PermissionSetController,
  MePermissionsController,
} from './permission-set.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  providers: [PermissionResolverService, ProfileService, PermissionSetService],
  controllers: [ProfileController, PermissionSetController, MePermissionsController],
  exports: [PermissionResolverService, ProfileService, PermissionSetService],
})
export class PermissionsModule implements OnModuleInit {
  private readonly log = new Logger(PermissionsModule.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ProfileService,
  ) {}

  async onModuleInit() {
    try {
      const tenants = await this.prisma.tenant.findMany({ select: { id: true, slug: true } });
      for (const t of tenants) {
        await this.profiles.seedDefaults(t.id);
      }
    } catch (err) {
      // Non-fatal — boot continues even if seeding hits a transient DB error.
      this.log.warn(`Default profile seeding skipped: ${(err as Error).message}`);
    }
  }
}
