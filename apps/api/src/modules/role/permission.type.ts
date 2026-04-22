import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
export class Permission {
  @Field(() => ID)
  id: string;

  @Field()
  code: string;

  @Field()
  name: string;

  @Field()
  group: string;

  @Field({ nullable: true })
  description?: string;
}
