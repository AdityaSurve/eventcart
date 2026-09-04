import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class GuestCheckoutBodyDto {
  @ApiPropertyOptional({ example: 'Alex Guest' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  guestName?: string;

  @ApiPropertyOptional({ example: 'guest@example.com' })
  @IsOptional()
  @IsEmail()
  guestEmail?: string;
}
