import { ObjectType, Field, ID, GraphQLISODateTime } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import { Paginated } from '../../common/graphql/paginated.type';
import { User } from '../user/user.type';
import { Account } from '../account/account.type';

@ObjectType()
export class Contact {
  @Field(() => ID)
  id: string;

  @Field()
  tenantId: string;

  @Field()
  ownerId: string;

  @Field(() => User, { nullable: true })
  owner?: User;

  @Field({ nullable: true })
  accountId?: string;

  @Field(() => Account, { nullable: true })
  account?: Account;

  @Field({ nullable: true })
  reportsToId?: string;

  @Field({ nullable: true })
  firstName?: string;

  @Field()
  lastName: string;

  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  department?: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  phone?: string;

  @Field({ nullable: true })
  mobile?: string;

  @Field({ nullable: true })
  fax?: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  birthday?: Date;

  @Field({ nullable: true })
  description?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class PaginatedContact extends Paginated(Contact) {}
