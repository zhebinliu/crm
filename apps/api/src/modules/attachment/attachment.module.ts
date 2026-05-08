// ─── AttachmentModule (Wave 18c) ─────────────────────────────────────────
// Wires AttachmentStorageService + AttachmentController.
// Add this to AppModule.imports to expose the /api/attachments routes.

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AttachmentStorageService } from './storage.service';
import { AttachmentController } from './attachment.controller';

@Module({
  imports: [ConfigModule],
  providers: [AttachmentStorageService],
  controllers: [AttachmentController],
  exports: [AttachmentStorageService],
})
export class AttachmentModule {}
