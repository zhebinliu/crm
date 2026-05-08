// TranslationModule is @Global() so MetadataService can optionally inject
// TranslationService without circular module imports (Wave 19g).
import { Global, Module } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { TranslationController } from './translation.controller';

@Global()
@Module({
  providers: [TranslationService],
  controllers: [TranslationController],
  exports: [TranslationService],
})
export class TranslationModule {}
