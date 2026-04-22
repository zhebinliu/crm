import { InputType, Field, Int } from '@nestjs/graphql';
import { FieldType } from '@prisma/client';

@InputType()
export class CreateObjectInput {
  @Field()
  apiName: string;

  @Field()
  label: string;

  @Field()
  labelPlural: string;

  @Field({ nullable: true })
  iconName?: string;
}

@InputType()
export class CreateFieldInput {
  @Field()
  apiName: string;

  @Field()
  label: string;

  @Field(() => FieldType)
  type: FieldType;

  @Field({ nullable: true })
  required?: boolean;

  @Field({ nullable: true })
  unique?: boolean;

  @Field({ nullable: true })
  helpText?: string;

  @Field({ nullable: true })
  picklistId?: string;

  @Field({ nullable: true })
  referenceTo?: string;

  @Field(() => Int, { nullable: true })
  precision?: number;

  @Field(() => Int, { nullable: true })
  scale?: number;

  @Field(() => Int, { nullable: true })
  displayOrder?: number;
}
