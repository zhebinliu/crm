import { InputType, Field, Int, Float, PartialType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@InputType()
export class CreateLeadInput {
  @Field({ nullable: true })
  firstName?: string;

  @Field()
  lastName: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  phone?: string;

  @Field({ nullable: true })
  company?: string;

  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  status?: string;

  @Field({ nullable: true })
  source?: string;

  @Field({ nullable: true })
  ownerId?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;
}

@InputType()
export class UpdateLeadInput extends PartialType(CreateLeadInput) {}

@InputType()
export class ConvertLeadInput {
  @Field({ nullable: true })
  accountName?: string;

  @Field({ nullable: true })
  existingAccountId?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  contactInput?: any;

  @Field(() => GraphQLJSON, { nullable: true })
  opportunityInput?: any;

  @Field({ nullable: true })
  doNotCreateOpp?: boolean;
}
