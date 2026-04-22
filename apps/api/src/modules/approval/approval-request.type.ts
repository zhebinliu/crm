import { ObjectType, Field, ID, GraphQLISODateTime } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import { Paginated } from '../../common/graphql/paginated.type';

@ObjectType()
export class ApprovalRequest {
  @Field(() => ID)
  id: string;

  @Field()
  tenantId: string;

  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

@ObjectType()
export class PaginatedApprovalRequest extends Paginated(ApprovalRequest) {}
