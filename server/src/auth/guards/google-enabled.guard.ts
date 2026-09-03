import { CanActivate, Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleEnabledGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate() {
    this.authService.assertGoogleEnabled();
    return true;
  }
}
