import { InputType, Field, PartialType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@InputType()
export class CreateContactInput {
  @Field({ nullable: true })
  accountId?: string;

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

  @Field({ nullable: true })
  birthday?: Date;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  ownerId?: string;

  @Field({ nullable: true })
  reportsToId?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  customData?: any;
}

@InputType()
export class UpdateContactInput extends PartialType(CreateContactInput) {}
