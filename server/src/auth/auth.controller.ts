import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  CurrentUser,
  RequestUser,
} from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { WebAuthnEmailDto } from './dto/webauthn-email.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { GoogleEnabledGuard } from './guards/google-enabled.guard';
import { WebAuthnService } from './webauthn.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly webAuthnService: WebAuthnService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register a new customer account' })
  @ApiCreatedResponse({
    description: 'Account created; JWT set as httpOnly cookie (also returned for API scripts)',
  })
  register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.register(dto, res);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiOkResponse({ description: 'Session cookie set' })
  login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(dto, res);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Clear the httpOnly session cookie' })
  logout(@Res({ passthrough: true }) res: Response) {
    return this.authService.logout(res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current authenticated user' })
  @ApiOkResponse({ description: 'Current user profile' })
  me(@CurrentUser() user: RequestUser) {
    return this.authService.getProfile(user.id);
  }

  @Get('google')
  @UseGuards(GoogleEnabledGuard, GoogleAuthGuard)
  @ApiOperation({ summary: 'Start Google OAuth (browser redirect)' })
  google() {
    return;
  }

  @Get('google/callback')
  @UseGuards(GoogleEnabledGuard, GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(
    @Req() req: Request & { user: Awaited<ReturnType<AuthService['findOrCreateGoogleUser']>> },
    @Res() res: Response,
  ) {
    this.authService.assertGoogleEnabled();
    await this.authService.loginWithUser(res, req.user);
    return res.redirect(`${this.authService.frontendRedirect()}/auth/callback`);
  }

  @Post('webauthn/register/options')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'WebAuthn registration options (passkey / Windows Hello)' })
  webauthnRegisterOptions(@CurrentUser() user: RequestUser) {
    return this.webAuthnService.registrationOptions({
      id: user.id,
      email: user.email,
      name: user.email,
    });
  }

  @Post('webauthn/register/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify WebAuthn registration' })
  webauthnRegisterVerify(
    @CurrentUser() user: RequestUser,
    @Body() body: RegistrationResponseJSON,
  ) {
    return this.webAuthnService.verifyRegistration(user.id, body);
  }

  @Get('webauthn/credentials')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  webauthnList(@CurrentUser() user: RequestUser) {
    return this.webAuthnService.listForUser(user.id);
  }

  @Post('webauthn/login/options')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'WebAuthn login options' })
  async webauthnLoginOptions(@Body() dto: WebAuthnEmailDto) {
    const { options } = await this.webAuthnService.authenticationOptions(
      dto.email,
    );
    return options;
  }

  @Post('webauthn/login/verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify WebAuthn login and set session cookie' })
  async webauthnLoginVerify(
    @Body() body: { email: string; response: AuthenticationResponseJSON },
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.webAuthnService.verifyAuthentication(
      body.email,
      body.response,
    );
    return this.authService.loginWithUser(res, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }
}
