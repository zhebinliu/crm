import { InputType, Field, PartialType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import { ActivityType, ActivityStatus } from '@prisma/client';

@InputType()
export class CreateActivityInput {
  @Field(() => ActivityType)
  type: ActivityType;

  @Field()
  subject: string;

  @Field({ nullable: true })
  priority?: string;

  @Field({ nullable: true })
  dueDate?: Date;

  @Field({ nullable: true })
  startAt?: Date;

  @Field({ nullable: true })
  endAt?: Date;

  @Field({ nullable: true })
  location?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  targetType?: string;

  @Field({ nullable: true })
  targetId?: string;

  @Field({ nullable: true })
  ownerId?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;
}

@InputType()
export class UpdateActivityInput extends PartialType(CreateActivityInput) {
  @Field(() => ActivityStatus, { nullable: true })
  status?: ActivityStatus;
}
