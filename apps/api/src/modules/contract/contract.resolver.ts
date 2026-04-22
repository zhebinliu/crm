import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ContractService } from './contract.service';
import { Contract, PaginatedContract } from './contract.type';
import { CreateContractInput, UpdateContractInput } from './contract.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

@Resolver(() => Contract)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContractResolver {
  constructor(private readonly service: ContractService) {}

  @Query(() => PaginatedContract)
  @RequirePermissions('contract.read')
  async contracts(
    @GqlCurrentUser() user: RequestUser,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const res = await this.service.list(user.tenantId, { skip, take });
    return { data: res.data, total: res.total };
  }

  @Query(() => Contract)
  @RequirePermissions('contract.read')
  async contract(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.service.get(user.tenantId, id);
  }

  @Mutation(() => Contract)
  @RequirePermissions('contract.write')
  async createContract(
    @GqlCurrentUser() user: RequestUser,
    @Args('input') input: CreateContractInput,
  ) {
    return this.service.create(user.tenantId, input as any, user);
  }

  @Mutation(() => Contract)
  @RequirePermissions('contract.write')
  async updateContract(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateContractInput,
  ) {
    return this.service.update(user.tenantId, id, input as any, user);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('contract.delete')
  async deleteContract(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.service.softDelete(user.tenantId, id);
    return true;
  }
}
