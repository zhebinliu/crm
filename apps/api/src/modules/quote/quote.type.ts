import { ObjectType, Field, ID, GraphQLISODateTime } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import { Paginated } from '../../common/graphql/paginated.type';

@ObjectType()
export class Quote {
  @Field(() => ID)
  id: string;

  @Field()
  tenantId: string;

  @Field({ nullable: true })
  ownerId?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class PaginatedQuote extends Paginated(Quote) {}
