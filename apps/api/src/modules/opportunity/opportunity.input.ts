import { InputType, Field, Int, Float, PartialType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@InputType()
export class CreateOpportunityInput {
  @Field()
  accountId: string;

  @Field({ nullable: true })
  primaryContactId?: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  stage?: string;

  @Field(() => Float, { nullable: true })
  amount?: number;

  @Field({ nullable: true })
  currencyCode?: string;

  @Field(() => Int, { nullable: true })
  probability?: number;

  @Field({ nullable: true })
  forecastCategory?: string;

  @Field()
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

  @Field({ nullable: true })
  ownerId?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;
}

@InputType()
export class UpdateOpportunityInput extends PartialType(CreateOpportunityInput) {}
