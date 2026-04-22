import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecordService } from './record.service';

@Controller('records')
@UseGuards(JwtAuthGuard)
export class RecordController {
  constructor(private readonly recordService: RecordService) {}

  @Get(':objectApiName')
  async listRecords(@Req() req: any, @Param('objectApiName') objName: string, @Query() query: any) {
    return this.recordService.listRecords(req.user.tenantId, objName, query);
  }

  @Get(':objectApiName/:id')
  async getRecord(@Req() req: any, @Param('objectApiName') objName: string, @Param('id') id: string) {
    return this.recordService.getRecord(req.user.tenantId, objName, id);
  }

  @Post(':objectApiName')
  async createRecord(@Req() req: any, @Param('objectApiName') objName: string, @Body() data: any) {
    return this.recordService.createRecord(req.user, objName, data);
  }

  @Put(':objectApiName/:id')
  async updateRecord(@Req() req: any, @Param('objectApiName') objName: string, @Param('id') id: string, @Body() data: any) {
    return this.recordService.updateRecord(req.user, objName, id, data);
  }

  @Delete(':objectApiName/:id')
  async deleteRecord(@Req() req: any, @Param('objectApiName') objName: string, @Param('id') id: string) {
    return this.recordService.deleteRecord(req.user, objName, id);
  }
}
