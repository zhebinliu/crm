import { InputType, Field, PartialType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@InputType()
export class CreateOrderInput {
  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;
}

@InputType()
export class UpdateOrderInput extends PartialType(CreateOrderInput) {}
