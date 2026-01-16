import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly logger: PinoLogger) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
    this.logger.setContext(PrismaService.name);
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.info('Database connection established');

    // Query logging for development
    // @ts-expect-error Prisma event typing
    this.$on('query', (e: { query: string; duration: number }) => {
      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug({ query: e.query, duration: `${e.duration}ms` }, 'Query executed');
      }
    });

    // @ts-expect-error Prisma event typing
    this.$on('error', (e: { message: string }) => {
      this.logger.error({ error: e.message }, 'Database error');
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.info('Database connection closed');
  }

  /**
   * Health check için basit query
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
