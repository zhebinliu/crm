import { ObjectType, Field, ID, GraphQLISODateTime } from '@nestjs/graphql';
import { Paginated } from '../../common/graphql/paginated.type';
import { Role } from '../role/role.type';

@ObjectType()
export class User {
  @Field(() => ID)
  id: string;

  @Field()
  tenantId: string;

  @Field()
  email: string;

  @Field()
  displayName: string;

  @Field({ nullable: true })
  avatarUrl?: string;

  @Field({ nullable: true })
  phone?: string;

  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  department?: string;

  @Field({ nullable: true })
  managerId?: string;

  @Field()
  isActive: boolean;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastLoginAt?: Date;

  @Field()
  locale: string;

  @Field()
  timezone: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  @Field(() => [String], { nullable: true })
  permissions?: string[];

  @Field(() => [Role], { nullable: true })
  roles?: Role[];
}

@ObjectType()
export class PaginatedUser extends Paginated(User) {}
