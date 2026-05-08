import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ValidationRuleService } from './validation-rule.service';
import { ValidationRule, PaginatedValidationRule } from './validation-rule.type';
import { CreateValidationRuleInput, UpdateValidationRuleInput } from './validation-rule.input';
import { GqlCurrentUser } from '../auth/decorators/gql-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { RequestUser } from '../../common/types/request-context';

@Resolver(() => ValidationRule)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ValidationRuleResolver {
  constructor(private readonly validationRuleService: ValidationRuleService) {}

  @Query(() => PaginatedValidationRule)
  @RequirePermissions('validationRule.read')
  async validationRules(
    @GqlCurrentUser() user: RequestUser,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const res = await this.validationRuleService.listPaginated(user.tenantId, { skip, take });
    return { data: res.data, total: res.total };
  }

  @Query(() => ValidationRule)
  @RequirePermissions('validationRule.read')
  async validationRule(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.validationRuleService.get(user.tenantId, id);
  }

  @Mutation(() => ValidationRule)
  @RequirePermissions('validationRule.write')
  async createValidationRule(
    @GqlCurrentUser() _user: RequestUser,
    @Args('input') input: CreateValidationRuleInput,
  ) {
    return this.validationRuleService.create(_user.tenantId, input as any);
  }

  @Mutation(() => ValidationRule)
  @RequirePermissions('validationRule.write')
  async updateValidationRule(
    @GqlCurrentUser() _user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateValidationRuleInput,
  ) {
    return this.validationRuleService.update(_user.tenantId, id, input as any);
  }

  @Mutation(() => Boolean)
  @RequirePermissions('validationRule.delete')
  async deleteValidationRule(
    @GqlCurrentUser() user: RequestUser,
    @Args('id', { type: () => ID }) id: string,
  ) {
    await this.validationRuleService.softDelete(user.tenantId, id);
    return true;
  }
}
