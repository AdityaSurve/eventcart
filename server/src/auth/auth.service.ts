import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { Profile } from 'passport-google-oauth20';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { clearAuthCookie, setAuthCookie } from './auth-cookie';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  hasPassword?: boolean;
  hasGoogle?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  isGoogleEnabled() {
    return Boolean(
      this.configService.get<string>('GOOGLE_CLIENT_ID') &&
        this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
    );
  }

  assertGoogleEnabled() {
    if (!this.isGoogleEnabled()) {
      throw new ServiceUnavailableException(
        'Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (Google Cloud OAuth client, authorized redirect http://localhost:3000/auth/google/callback).',
      );
    }
  }

  async register(dto: RegisterDto, res: Response) {
    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      password: dto.password,
    });

    return this.completeAuth(res, user);
  }

  async login(dto: LoginDto, res: Response) {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException(
        user
          ? 'This account uses Google or a passkey. Choose that sign-in method.'
          : 'Invalid email or password',
      );
    }

    const isValid = await this.usersService.comparePassword(
      dto.password,
      user.passwordHash,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.completeAuth(res, this.usersService.toResponse(user));
  }

  async loginWithUser(res: Response, user: AuthUser) {
    return this.completeAuth(res, user);
  }

  async logout(res: Response) {
    clearAuthCookie(res);
    return { ok: true };
  }

  async getProfile(userId: string) {
    return this.usersService.findOne(userId);
  }

  async findOrCreateGoogleUser(profile: Profile): Promise<AuthUser> {
    const googleId = profile.id;
    const email = profile.emails?.[0]?.value?.toLowerCase();
    const name = profile.displayName || email || 'Google user';

    if (!email) {
      throw new UnauthorizedException('Google account has no email');
    }

    const existingGoogle = await this.prisma.user.findUnique({
      where: { googleId },
    });

    if (existingGoogle) {
      return this.usersService.toResponse(existingGoogle);
    }

    const byEmail = await this.prisma.user.findUnique({ where: { email } });

    if (byEmail) {
      const linked = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId },
      });
      return this.usersService.toResponse(linked);
    }

    const created = await this.prisma.user.create({
      data: {
        name,
        email,
        googleId,
      },
    });

    return this.usersService.toResponse(created);
  }

  frontendRedirect() {
    return this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
  }

  private completeAuth(res: Response, user: AuthUser) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload);
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '1h');
    setAuthCookie(res, accessToken, expiresIn);

    return {
      accessToken,
      user,
    };
  }
}
