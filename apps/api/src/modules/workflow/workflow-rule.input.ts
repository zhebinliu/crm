import { InputType, Field, PartialType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@InputType()
export class CreateWorkflowRuleInput {
  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;
}

@InputType()
export class UpdateWorkflowRuleInput extends PartialType(CreateWorkflowRuleInput) {}
