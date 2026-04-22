import { InputType, Field, Int, Float, PartialType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@InputType()
export class CreateAccountInput {
  @Field()
  name: string;

  @Field({ nullable: true })
  type?: string;

  @Field({ nullable: true })
  industry?: string;

  @Field({ nullable: true })
  website?: string;

  @Field({ nullable: true })
  phone?: string;

  @Field(() => Float, { nullable: true })
  annualRevenue?: number;

  @Field(() => Int, { nullable: true })
  employeeCount?: number;

  @Field({ nullable: true })
  rating?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  billingStreet?: string;

  @Field({ nullable: true })
  billingCity?: string;

  @Field({ nullable: true })
  billingState?: string;

  @Field({ nullable: true })
  billingPostalCode?: string;

  @Field({ nullable: true })
  billingCountry?: string;

  @Field({ nullable: true })
  shippingStreet?: string;

  @Field({ nullable: true })
  shippingCity?: string;

  @Field({ nullable: true })
  shippingState?: string;

  @Field({ nullable: true })
  shippingPostalCode?: string;

  @Field({ nullable: true })
  shippingCountry?: string;

  @Field({ nullable: true })
  ownerId?: string;

  @Field({ nullable: true })
  parentId?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;
}

@InputType()
export class UpdateAccountInput extends PartialType(CreateAccountInput) {}
