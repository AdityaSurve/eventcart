import {
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AUTH_COOKIE_NAME } from '../auth/auth-cookie';
import { getCorsOrigins } from '../common/config/security.env';
import { Role } from '../generated/prisma/enums';

type OrderRealtimePayload = {
  orderId: string;
  orderNumber: string;
  userId: string;
  status: string;
  previousStatus?: string;
  paymentStatus?: string;
};

@WebSocketGateway({
  cors: {
    origin: getCorsOrigins(),
    credentials: true,
  },
})
export class OrdersGateway implements OnGatewayConnection {
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        role: Role;
      }>(token);

      await client.join(`user:${payload.sub}`);
      if (payload.role === Role.ADMIN) {
        await client.join('admins');
      }
    } catch (error) {
      this.logger.debug(`Socket auth failed: ${(error as Error).message}`);
      client.disconnect();
    }
  }

  emitOrderUpdated(payload: OrderRealtimePayload) {
    this.server.to(`user:${payload.userId}`).emit('order.updated', payload);
    this.server.to('admins').emit('order.updated', payload);
  }

  private extractToken(client: Socket) {
    const cookieHeader = client.handshake.headers.cookie;
    if (cookieHeader) {
      const match = cookieHeader
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));
      if (match) {
        return decodeURIComponent(match.slice(AUTH_COOKIE_NAME.length + 1));
      }
    }

    const auth = client.handshake.auth as { token?: string } | undefined;
    return auth?.token;
  }
}
