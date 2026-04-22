import { Module } from '@nestjs/common';
import { RoleService } from './role.service';
import { RoleController } from './role.controller';
import { RoleResolver } from './role.resolver';

@Module({
  providers: [RoleService, RoleResolver],
  controllers: [RoleController],
  exports: [RoleService],
})
export class RoleModule {}
