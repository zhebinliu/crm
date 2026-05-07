import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventBusService } from './event-bus.service';
import { EventResolver } from './event.resolver';
import { InboundWebhookController } from './inbound-webhook.controller';
import { WebhookEndpointController } from './webhook-endpoint.controller';

@Module({
  imports: [
    // EventResolver verifies JWTs manually for WS subscriptions; depends on
    // the same secret as the main AuthModule.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'dev-secret-tokenwave-crm',
        signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
      }),
    }),
  ],
  providers: [EventBusService, EventResolver],
  controllers: [InboundWebhookController, WebhookEndpointController],
  exports: [EventBusService],
})
export class EventsModule {}
