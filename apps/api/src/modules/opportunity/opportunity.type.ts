import { ObjectType, Field, ID, Int, Float, GraphQLISODateTime } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import { Paginated } from '../../common/graphql/paginated.type';
import { User } from '../user/user.type';
import { Account } from '../account/account.type';

@ObjectType()
export class Opportunity {
  @Field(() => ID)
  id: string;

  @Field()
  tenantId: string;

  @Field()
  ownerId: string;

  @Field(() => User, { nullable: true })
  owner?: User;

  @Field()
  accountId: string;

  @Field(() => Account, { nullable: true })
  account?: Account;

  @Field({ nullable: true })
  primaryContactId?: string;

  @Field()
  name: string;

  @Field()
  stage: string;

  @Field(() => Float, { nullable: true })
  amount?: number;

  @Field()
  currencyCode: string;

  @Field(() => Int)
  probability: number;

  @Field()
  forecastCategory: string;

  @Field(() => GraphQLISODateTime)
  closeDate: Date;

  @Field({ nullable: true })
  type?: string;

  @Field({ nullable: true })
  leadSource?: string;

  @Field({ nullable: true })
  nextStep?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  lossReason?: string;

  @Field()
  isClosed: boolean;

  @Field()
  isWon: boolean;

  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class PaginatedOpportunity extends Paginated(Opportunity) {}
