import { InputType, Field, PartialType } from '@nestjs/graphql';

@InputType()
export class CreateUserInput {
  @Field()
  email: string;

  @Field()
  password: string;

  @Field()
  displayName: string;

  @Field({ nullable: true })
  phone?: string;

  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  department?: string;

  @Field({ nullable: true })
  managerId?: string;

  @Field(() => [String], { nullable: true })
  roleCodes?: string[];
}

@InputType()
export class UpdateUserInput extends PartialType(CreateUserInput) {
  @Field({ nullable: true })
  isActive?: boolean;
}
