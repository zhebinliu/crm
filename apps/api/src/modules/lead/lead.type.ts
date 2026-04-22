import { ObjectType, Field, ID, Int, Float, GraphQLISODateTime } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import { Paginated } from '../../common/graphql/paginated.type';
import { User } from '../user/user.type';

@ObjectType()
export class Lead {
  @Field(() => ID)
  id: string;

  @Field()
  tenantId: string;

  @Field()
  ownerId: string;

  @Field(() => User, { nullable: true })
  owner?: User;

  @Field({ nullable: true })
  firstName?: string;

  @Field()
  lastName: string;

  @Field()
  company: string;

  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  phone?: string;

  @Field({ nullable: true })
  mobile?: string;

  @Field({ nullable: true })
  website?: string;

  @Field()
  status: string;

  @Field({ nullable: true })
  rating?: string;

  @Field({ nullable: true })
  source?: string;

  @Field({ nullable: true })
  industry?: string;

  @Field(() => Float, { nullable: true })
  annualRevenue?: number;

  @Field(() => Int, { nullable: true })
  employeeCount?: number;

  @Field(() => Int, { nullable: true })
  score?: number;

  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;

  @Field()
  isConverted: boolean;

  @Field({ nullable: true })
  convertedAccountId?: string;

  @Field({ nullable: true })
  convertedContactId?: string;

  @Field({ nullable: true })
  convertedOpportunityId?: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  convertedAt?: Date;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class PaginatedLead extends Paginated(Lead) {}
