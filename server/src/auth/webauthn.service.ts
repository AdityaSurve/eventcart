import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { getCorsOrigins } from '../common/config/security.env';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class WebAuthnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  private rpID() {
    return this.configService.get<string>('WEBAUTHN_RP_ID', 'localhost');
  }

  private origin() {
    return (
      this.configService.get<string>('WEBAUTHN_ORIGIN') ?? getCorsOrigins()[0]
    );
  }

  async registrationOptions(user: { id: string; email: string; name: string }) {
    const existing = await this.prisma.webAuthnCredential.findMany({
      where: { userId: user.id },
    });

    const options = await generateRegistrationOptions({
      rpName: 'EventCart',
      rpID: this.rpID(),
      userName: user.email,
      userDisplayName: user.name,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
      },
      excludeCredentials: existing.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports
          ? (cred.transports.split(',') as AuthenticatorTransport[])
          : undefined,
      })),
    });

    await this.redis.set(
      `webauthn:reg:${user.id}`,
      options.challenge,
      120,
    );

    return options;
  }

  async verifyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
  ) {
    const expectedChallenge = await this.redis.get(`webauthn:reg:${userId}`);

    if (!expectedChallenge) {
      throw new BadRequestException(
        'Passkey registration expired. Request new options and try again.',
      );
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin(),
      expectedRPID: this.rpID(),
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new UnauthorizedException('Could not verify passkey registration');
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    await this.prisma.webAuthnCredential.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: credential.transports?.join(','),
      },
    });

    await this.redis.del(`webauthn:reg:${userId}`);

    return { verified: true };
  }

  async authenticationOptions(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { webauthnCredentials: true },
    });

    if (!user || user.webauthnCredentials.length === 0) {
      throw new UnauthorizedException(
        'No passkey is registered for this email',
      );
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpID(),
      userVerification: 'preferred',
      allowCredentials: user.webauthnCredentials.map((cred) => ({
        id: cred.credentialId,
        transports: cred.transports
          ? (cred.transports.split(',') as AuthenticatorTransport[])
          : undefined,
      })),
    });

    await this.redis.set(
      `webauthn:login:${user.id}`,
      JSON.stringify({ challenge: options.challenge, userId: user.id }),
      120,
    );

    return { options, userId: user.id };
  }

  async verifyAuthentication(
    email: string,
    response: AuthenticationResponseJSON,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { webauthnCredentials: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid passkey login');
    }

    const raw = await this.redis.get(`webauthn:login:${user.id}`);

    if (!raw) {
      throw new BadRequestException(
        'Passkey login expired. Request new options and try again.',
      );
    }

    const { challenge } = JSON.parse(raw) as { challenge: string };
    const stored = user.webauthnCredentials.find(
      (cred) => cred.credentialId === response.id,
    );

    if (!stored) {
      throw new UnauthorizedException('Unknown passkey');
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: this.origin(),
      expectedRPID: this.rpID(),
      requireUserVerification: false,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports?.split(','),
      },
    });

    if (!verification.verified) {
      throw new UnauthorizedException('Could not verify passkey');
    }

    await this.prisma.webAuthnCredential.update({
      where: { id: stored.id },
      data: { counter: verification.authenticationInfo.newCounter },
    });

    await this.redis.del(`webauthn:login:${user.id}`);

    return user;
  }

  async listForUser(userId: string) {
    const items = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
      },
    });

    return { items };
  }
}

type AuthenticatorTransport = 'ble' | 'hybrid' | 'internal' | 'nfc' | 'usb';
