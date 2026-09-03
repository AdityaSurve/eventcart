import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  RequestUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../generated/prisma/enums';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a user (admin only)' })
  @ApiCreatedResponse({ description: 'User created' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List users (admin only)' })
  @ApiOkResponse({ description: 'Paginated user list' })
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id (admin or self)' })
  @ApiOkResponse({ description: 'User found' })
  findOne(@Param('id') id: string, @CurrentUser() currentUser: RequestUser) {
    this.assertSelfOrAdmin(id, currentUser);
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user (admin or self)' })
  @ApiOkResponse({ description: 'User updated' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    this.assertSelfOrAdmin(id, currentUser);

    if (currentUser.role !== Role.ADMIN) {
      if (dto.role !== undefined) {
        throw new ForbiddenException('You cannot change your role');
      }
    }

    return this.usersService.update(id, dto);
  }

  private assertSelfOrAdmin(targetId: string, currentUser: RequestUser) {
    if (currentUser.role === Role.ADMIN || currentUser.id === targetId) {
      return;
    }

    throw new ForbiddenException('You can only access your own user profile');
  }
}
