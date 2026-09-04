import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import {
  CurrentUser,
  RequestUser,
} from '../common/decorators/current-user.decorator';
import { OptionalUser } from '../common/decorators/cart-owner.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../generated/prisma/enums';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Place a new order' })
  @ApiCreatedResponse({ description: 'Order created' })
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: RequestUser) {
    return this.ordersService.create({
      userId: user.id,
      items: dto.items,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
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

  @Get(':id/receipt.pdf')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Download order receipt PDF' })
  @Header('Content-Type', 'application/pdf')
  async receipt(
    @Param('id') id: string,
    @OptionalUser() user: RequestUser | null,
    @Query('guestEmail') guestEmail: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const order = await this.ordersService.findOne(id);
    this.assertCanAccessOrder(order, user, guestEmail);
    const pdf = await this.ordersService.buildReceiptPdf(id);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipt-${order.orderNumber}.pdf"`,
    );
    return new StreamableFile(pdf);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get an order by id (admin, owner, or guest email)' })
  @ApiOkResponse({ description: 'Order found' })
  async findOne(
    @Param('id') id: string,
    @OptionalUser() user: RequestUser | null,
    @Query('guestEmail') guestEmail?: string,
  ) {
    const order = await this.ordersService.findOne(id);
    this.assertCanAccessOrder(order, user, guestEmail);
    return order;
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel own pending/confirmed order' })
  @ApiOkResponse({ description: 'Order cancelled' })
  cancel(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.ordersService.cancelByCustomer(id, user.id);
  }

  private assertCanAccessOrder(
    order: {
      userId: string | null;
      guestEmail: string | null;
    },
    currentUser: RequestUser | null,
    guestEmail?: string,
  ) {
    if (currentUser?.role === Role.ADMIN) {
      return;
    }

    if (currentUser && order.userId && currentUser.id === order.userId) {
      return;
    }

    if (
      guestEmail &&
      order.guestEmail &&
      guestEmail.trim().toLowerCase() === order.guestEmail.toLowerCase()
    ) {
      return;
    }

    throw new ForbiddenException('You can only access your own orders');
  }
}
