import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from './current-user.decorator';

export type CartOwner = {
  kind: 'user' | 'guest';
  id: string;
};

type RequestWithAuth = {
  user?: RequestUser | null;
  headers: Record<string, string | string[] | undefined>;
};

export const CartOwnerParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CartOwner | null => {
    const request = ctx.switchToHttp().getRequest<RequestWithAuth>();
    const user = request.user;

    if (user?.id) {
      return { kind: 'user', id: user.id };
    }

    const raw = request.headers['x-guest-id'];
    const guestId = Array.isArray(raw) ? raw[0] : raw;

    if (guestId && typeof guestId === 'string' && guestId.trim()) {
      return { kind: 'guest', id: guestId.trim() };
    }

    return null;
  },
);

export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | null => {
    const request = ctx.switchToHttp().getRequest<{ user?: RequestUser | null }>();
    return request.user ?? null;
  },
);
