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
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Place a new order' })
  @ApiCreatedResponse({ description: 'Order created' })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: RequestUser) {
    return this.ordersService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List orders (own orders, or all for admin)' })
  @ApiOkResponse({ description: 'Paginated order list' })
  findAll(
    @Query() query: ListOrdersQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (user.role !== Role.ADMIN && query.userId) {
      throw new ForbiddenException('Only admins can filter by userId');
    }

    return this.ordersService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an order by id (admin or owner)' })
  @ApiOkResponse({ description: 'Order found' })
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    const order = await this.ordersService.findOne(id);
    this.assertOwnerOrAdmin(order.userId, user);
    return order;
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update order status (admin only)' })
  @ApiOkResponse({ description: 'Order status updated' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ordersService.updateStatus(id, dto, user.id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel own pending/confirmed order' })
  @ApiOkResponse({ description: 'Order cancelled' })
  cancel(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.ordersService.cancelByCustomer(id, user.id);
  }

  private assertOwnerOrAdmin(orderUserId: string, currentUser: RequestUser) {
    if (currentUser.role === Role.ADMIN || currentUser.id === orderUserId) {
      return;
    }

    throw new ForbiddenException('You can only access your own orders');
  }
}
