import { InputType, Field, PartialType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@InputType()
export class CreateQuoteInput {
  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;
}

@InputType()
export class UpdateQuoteInput extends PartialType(CreateQuoteInput) {}
