// ─── EventResolver ───────────────────────────────────────────────────────
// GraphQL Subscriptions surfacing the EventBus to clients.
// Front-end subscribes to:
//   • events(tenantId)                       — every change in tenant
//   • events(tenantId, recordType)           — only this object type
//   • events(tenantId, recordType, recordId) — only this specific record
//
// Authentication is enforced via JwtAuthGuard. The guard pulls the JWT
// from the WS connectionParams.Authorization header (graphql-ws protocol).

import { ObjectType, Field, Resolver, Subscription, Args, ID, Context } from '@nestjs/graphql';
import { Inject, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GraphQLJSON } from 'graphql-type-json';
import { EventBusService } from './event-bus.service';
import { Public } from '../auth/decorators/public.decorator';

@ObjectType()
export class PlatformEvent {
  @Field()
  event!: string; // "Lead.Created"

  @Field(() => ID)
  tenantId!: string;

  @Field()
  recordType!: string;

  @Field(() => ID)
  recordId!: string;

  @Field(() => GraphQLJSON, { nullable: true })
  payload?: unknown;

  @Field()
  at!: string;

  @Field(() => ID)
  outboxId!: string;
}

@Resolver()
export class EventResolver {
  constructor(
    @Inject(EventBusService) private readonly bus: EventBusService,
    private readonly jwt: JwtService,
  ) {}

  // @Public bypasses the global JwtAuthGuard. We verify the bearer token
  // manually below so the resolver works under both HTTP and WS contexts
  // (where passport-jwt's req.headers extractor doesn't apply).
  @Public()
  @Subscription(() => PlatformEvent, {
    name: 'events',
    description: 'Real-time platform events for a tenant. Optionally narrow by recordType or recordId. Authenticate via WS connectionParams.Authorization.',
    filter: (payload, variables) => {
      // Defense-in-depth: never leak across tenants
      if (payload.tenantId !== variables.tenantId) return false;
      if (variables.recordType && payload.recordType !== variables.recordType) return false;
      if (variables.recordId && payload.recordId !== variables.recordId) return false;
      return true;
    },
    resolve: (payload) => payload,
  })
  events(
    @Args('tenantId', { type: () => ID }) tenantId: string,
    @Args('recordType', { type: () => String, nullable: true }) recordType: string | null,
    @Args('recordId', { type: () => ID, nullable: true }) recordId: string | null,
    @Context() ctx: { connectionParams?: Record<string, string>; req?: { headers?: { authorization?: string } } },
  ) {
    void recordType;
    void recordId;
    // Manual JWT verification — works for both HTTP and WS subscription contexts.
    const auth =
      ctx.connectionParams?.Authorization ??
      ctx.connectionParams?.authorization ??
      ctx.req?.headers?.authorization;
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException({ code: 'NO_TOKEN' });
    }
    const token = auth.slice('bearer '.length);
    try {
      const claims = this.jwt.verify<{ tid: string }>(token);
      // Cross-tenant leak prevention: subscriber's JWT tenant must equal the
      // tenantId they're subscribing to.
      if (claims.tid !== tenantId) {
        throw new UnauthorizedException({ code: 'CROSS_TENANT_DENIED' });
      }
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException({ code: 'BAD_TOKEN', message: (e as Error).message });
    }
    return this.bus.asyncIterator(`events.${tenantId}`);
  }
}
