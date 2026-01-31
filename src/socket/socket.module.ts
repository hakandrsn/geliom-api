import { Module, Global } from '@nestjs/common';
import { SocketGateway } from './socket.gateway';
import { PrismaModule } from '@/prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [SocketGateway],
  exports: [SocketGateway],
})
export class SocketModule {}
