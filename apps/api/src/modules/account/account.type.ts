import { ObjectType, Field, ID, Int, Float, GraphQLISODateTime } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import { Paginated } from '../../common/graphql/paginated.type';
import { User } from '../user/user.type';

@ObjectType()
export class Account {
  @Field(() => ID)
  id: string;

  @Field()
  tenantId: string;

  @Field()
  ownerId: string;

  @Field(() => User, { nullable: true })
  owner?: User;

  @Field({ nullable: true })
  parentId?: string;

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

  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class PaginatedAccount extends Paginated(Account) {}
