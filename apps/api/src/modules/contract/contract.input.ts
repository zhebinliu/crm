import { InputType, Field, PartialType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@InputType()
export class CreateContractInput {
  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;
}

@InputType()
export class UpdateContractInput extends PartialType(CreateContractInput) {}
