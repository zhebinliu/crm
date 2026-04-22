import { InputType, Field, PartialType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@InputType()
export class CreateValidationRuleInput {
  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;
}

@InputType()
export class UpdateValidationRuleInput extends PartialType(CreateValidationRuleInput) {}
