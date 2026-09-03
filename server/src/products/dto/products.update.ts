import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from "./products.create"

export class UpdateProductDto extends PartialType(CreateProductDto) {}
