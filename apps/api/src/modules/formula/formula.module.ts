import { Module } from '@nestjs/common';
import { FormulaService } from './formula.service';
import { FormulaController } from './formula.controller';

@Module({
  providers: [FormulaService],
  controllers: [FormulaController],
  exports: [FormulaService],
})
export class FormulaModule {}
