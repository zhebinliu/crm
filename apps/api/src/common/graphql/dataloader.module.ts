// ─── DataLoaderModule — per-request loader factory ─────────────────────
//
// Provides a `DataLoaderRegistry` factory that resolvers can build once
// per request. Wiring happens at the GraphQL context factory in
// app.module.ts (see DATALOADER_WIRING_INSTRUCTIONS below).
//
// This module is @Global so resolvers don't need to import it.

import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DataLoaderRegistry } from './dataloader.registry';

export const DATA_LOADER_FACTORY = 'DATA_LOADER_FACTORY';

/**
 * A factory that builds a fresh DataLoaderRegistry per call. Inject this
 * symbol when you need to create a registry inside a non-GraphQL context
 * (e.g. resolvers/services that don't already receive `loaders` via
 * GraphQL context).
 */
export type DataLoaderFactory = (tenantId: string | null) => DataLoaderRegistry;

@Global()
@Module({
  providers: [
    {
      provide: DATA_LOADER_FACTORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): DataLoaderFactory => {
        return (tenantId) => new DataLoaderRegistry(prisma, tenantId);
      },
    },
  ],
  exports: [DATA_LOADER_FACTORY],
})
export class DataLoaderModule {}

// ─── Wiring instructions for app.module.ts ──────────────────────────────
//
// 1. import { DataLoaderModule } from './common/graphql/dataloader.module';
//    import { DataLoaderRegistry } from './common/graphql/dataloader.registry';
//    import { PrismaService } from './prisma/prisma.service';
//
// 2. Add `DataLoaderModule` to AppModule.imports.
//
// 3. Replace the GraphQL context factory in `GraphQLModule.forRoot({...})`
//    with one that builds a registry per request:
//
//      GraphQLModule.forRootAsync<ApolloDriverConfig>({
//        driver: ApolloDriver,
//        inject: [PrismaService],
//        useFactory: (prisma: PrismaService) => ({
//          autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
//          sortSchema: true,
//          playground: true,
//          context: ({ req, res, connectionParams, extra }) => {
//            const tenantId = (req?.user?.tenantId as string | undefined)
//              ?? (req?.tenantId as string | undefined)
//              ?? null;
//            return connectionParams
//              ? { connectionParams, extra, loaders: new DataLoaderRegistry(prisma, tenantId) }
//              : { req, res, loaders: new DataLoaderRegistry(prisma, tenantId) };
//          },
//          subscriptions: { 'graphql-ws': true },
//        }),
//      }),
//
// 4. In each resolver method that needs loaders, inject the GraphQL
//    context: `@Context() ctx: { loaders: DataLoaderRegistry }`. See
//    apps/api/src/modules/account/account.resolver.ts for an example.
