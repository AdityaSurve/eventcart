import { CookieOptions, Response } from 'express';
import { isProduction } from '../common/config/security.env';

export const AUTH_COOKIE_NAME = 'eventcart_access';

export function cookieMaxAgeMs(expiresIn: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiresIn.trim());

  if (!match) {
    return 60 * 60 * 1000;
  }

  const value = Number(match[1]);
  const unit = match[2];

  if (unit === 's') return value * 1000;
  if (unit === 'm') return value * 60 * 1000;
  if (unit === 'h') return value * 60 * 60 * 1000;
  return value * 24 * 60 * 60 * 1000;
}

export function authCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function setAuthCookie(res: Response, token: string, expiresIn: string) {
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions(cookieMaxAgeMs(expiresIn)));
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
  });
}
