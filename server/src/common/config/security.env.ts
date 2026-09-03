const MIN_JWT_SECRET_LENGTH = 32;

export function assertSecureEnv() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be set and at least ${MIN_JWT_SECRET_LENGTH} characters`,
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }
}

export function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}
