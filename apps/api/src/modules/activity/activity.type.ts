import { ObjectType, Field, ID, GraphQLISODateTime, registerEnumType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import { ActivityType, ActivityStatus } from '@prisma/client';
import { Paginated } from '../../common/graphql/paginated.type';
import { User } from '../user/user.type';

registerEnumType(ActivityType, { name: 'ActivityType' });
registerEnumType(ActivityStatus, { name: 'ActivityStatus' });

@ObjectType()
export class Activity {
  @Field(() => ID)
  id: string;

  @Field()
  tenantId: string;

  @Field()
  ownerId: string;

  @Field(() => User, { nullable: true })
  owner?: User;

  @Field(() => ActivityType)
  type: ActivityType;

  @Field()
  subject: string;

  @Field(() => ActivityStatus)
  status: ActivityStatus;

  @Field()
  priority: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  dueDate?: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  startAt?: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  endAt?: Date;

  @Field({ nullable: true })
  location?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  targetType?: string;

  @Field({ nullable: true })
  targetId?: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  completedAt?: Date;

  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class PaginatedActivity extends Paginated(Activity) {}
