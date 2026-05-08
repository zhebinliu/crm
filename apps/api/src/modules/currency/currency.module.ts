// CurrencyModule is @Global() so Opportunity / Quote / Order services can
// optionally inject CurrencyService without each one having to import this
// module — mirrors the EmbeddingsModule pattern (Wave 19g).
import { Global, Module } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { CurrencyController } from './currency.controller';

@Global()
@Module({
  providers: [CurrencyService],
  controllers: [CurrencyController],
  exports: [CurrencyService],
})
export class CurrencyModule {}
