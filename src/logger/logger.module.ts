import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';

        return {
          pinoHttp: {
            level: isProduction ? 'info' : 'debug',
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: false,
                    levelFirst: true,
                    translateTime: 'SYS:HH:MM:ss',
                    ignore: 'pid,hostname',
                    messageFormat: '{msg}',
                  },
                },
            serializers: {
              req: (req) => ({
                method: req.method,
                url: req.url,
                userId: req.raw?.user?.id,
              }),
              res: (res) => ({
                statusCode: res.statusCode,
              }),
            },
            customProps: () => ({
              context: 'HTTP',
            }),
            autoLogging: {
              ignore: (req) => {
                // Health check endpoint'lerini loglamayı atla
                return req.url === '/api/health' || req.url === '/health';
              },
            },
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
