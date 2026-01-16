import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
  sub: string; // User UUID from Supabase Auth
  email?: string;
  iat?: number;
  exp?: number;
}

export interface CurrentUserData {
  id: string;
  email?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserData | undefined, ctx: ExecutionContext): CurrentUserData | string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserData;

    if (!user) {
      return undefined;
    }

    if (data) {
      return user[data];
    }

    return user;
  },
);
