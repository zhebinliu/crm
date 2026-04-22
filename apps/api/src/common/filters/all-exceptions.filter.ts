import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ERR } from '@tokenwave/shared';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response | any>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      body =
        typeof resp === 'string'
          ? { code: 'HTTP_ERROR', message: resp }
          : { code: 'HTTP_ERROR', ...(resp as Record<string, unknown>) };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        body = {
          code: ERR.CONFLICT,
          message: 'Duplicate value',
          target: exception.meta?.target,
        };
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        body = { code: ERR.NOT_FOUND, message: 'Record not found' };
      } else {
        status = HttpStatus.BAD_REQUEST;
        body = { code: 'PRISMA_ERROR', message: exception.message };
      }
    } else if (exception instanceof Error) {
      this.log.error(exception.stack || exception.message);
      body = { code: 'INTERNAL_ERROR', message: exception.message };
    }

    if (req && req.method) {
      if (status >= 500) {
        this.log.error(`${req.method} ${req.url} -> ${status}`, exception as Error);
      }
      if (res.status && typeof res.status === 'function') {
        res.status(status).json({ error: body, path: req.url, timestamp: new Date().toISOString() });
        return;
      }
    }

    // GraphQL context - throw the exception to let GraphQL handle it properly
    throw exception;
  }
}
