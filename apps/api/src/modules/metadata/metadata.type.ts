import { ObjectType, Field, ID, registerEnumType, Int } from '@nestjs/graphql';
import { FieldType } from '@prisma/client';

registerEnumType(FieldType, { name: 'FieldType' });

@ObjectType()
export class PicklistValue {
  @Field(() => ID)
  id: string;

  @Field()
  value: string;

  @Field()
  label: string;

  @Field({ nullable: true })
  color?: string;

  @Field(() => Int)
  displayOrder: number;

  @Field()
  isActive: boolean;
}

@ObjectType()
export class Picklist {
  @Field(() => ID)
  id: string;

  @Field()
  tenantId: string;

  @Field()
  apiName: string;

  @Field()
  label: string;

  @Field()
  isSystem: boolean;

  @Field(() => [PicklistValue], { nullable: true })
  values?: PicklistValue[];
}

@ObjectType()
export class FieldDef {
  @Field(() => ID)
  id: string;

  @Field()
  apiName: string;

  @Field()
  label: string;

  @Field(() => FieldType)
  type: FieldType;

  @Field()
  required: boolean;

  @Field()
  unique: boolean;

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

  @Field()
  isSystem: boolean;

  @Field()
  isCustom: boolean;

  @Field(() => Int)
  displayOrder: number;
}

@ObjectType()
export class ObjectDef {
  @Field(() => ID)
  id: string;

  @Field()
  apiName: string;

  @Field()
  label: string;

  @Field()
  labelPlural: string;

  @Field({ nullable: true })
  iconName?: string;

  @Field()
  isSystem: boolean;

  @Field()
  isCustom: boolean;

  @Field(() => [FieldDef], { nullable: true })
  fields?: FieldDef[];
}
