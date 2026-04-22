import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';

import { PrismaModule } from './prisma/prisma.module';
import { OutboxModule } from './common/outbox.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UserModule } from './modules/user/user.module';
import { RoleModule } from './modules/role/role.module';
import { MetadataModule } from './modules/metadata/metadata.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { ApprovalModule } from './modules/approval/approval.module';

import { LeadModule } from './modules/lead/lead.module';
import { AccountModule } from './modules/account/account.module';
import { ContactModule } from './modules/contact/contact.module';
import { OpportunityModule } from './modules/opportunity/opportunity.module';
import { ProductModule } from './modules/product/product.module';
import { PriceBookModule } from './modules/pricebook/pricebook.module';
import { QuoteModule } from './modules/quote/quote.module';
import { OrderModule } from './modules/order/order.module';
import { ContractModule } from './modules/contract/contract.module';
import { ActivityModule } from './modules/activity/activity.module';
import { RecordModule } from './modules/record/record.module';
import { EmailTemplateModule } from './modules/email-template/email-template.module';

import { HealthController } from './health.controller';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: true }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      useFactory: () => {
        const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
          },
        };
      },
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: true,
      context: ({ req, res }) => ({ req, res }),
    }),

    PrismaModule,
    OutboxModule,
    AuthModule,
    TenantModule,
    UserModule,
    RoleModule,
    MetadataModule,
    WorkflowModule,
    ApprovalModule,

    LeadModule,
    AccountModule,
    ContactModule,
    OpportunityModule,
    ProductModule,
    PriceBookModule,
    QuoteModule,
    OrderModule,
    ContractModule,
    ActivityModule,
    RecordModule,
    EmailTemplateModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
