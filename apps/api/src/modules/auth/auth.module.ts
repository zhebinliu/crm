import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { MfaService } from './mfa.service';
import { MfaController } from './mfa.controller';
import { ApiKeyService } from './api-key.service';
import { ApiKeyController } from './api-key.controller';
import { CryptoModule } from '../../common/crypto.service';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    CryptoModule,
    PermissionsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (c: ConfigService) => ({
        secret: c.get<string>('JWT_SECRET') ?? 'dev-secret',
        signOptions: { expiresIn: Number(c.get('JWT_ACCESS_TTL') ?? 900) },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, MfaService, ApiKeyService],
  controllers: [AuthController, MfaController, ApiKeyController],
  // Export ApiKeyService so the global ApiKeyAuthMiddleware can resolve it
  // when AppModule wires the middleware in.
  exports: [AuthService, MfaService, ApiKeyService],
})
export class AuthModule {}
