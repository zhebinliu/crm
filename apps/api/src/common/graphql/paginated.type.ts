import { ObjectType, Field, Int } from '@nestjs/graphql';
import { Type } from '@nestjs/common';

export function Paginated<T>(classRef: Type<T>): any {
  @ObjectType({ isAbstract: true })
  abstract class PaginatedType {
    @Field(() => [classRef], { description: 'Paginated data results' })
    data: T[];

    @Field(() => Int, { description: 'Total count of records matching the criteria' })
    total: number;
  }
  return PaginatedType;
}
