import {
  Global,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const url = this.configService.get<string>('REDIS_URL');

    if (!url) {
      throw new Error('REDIS_URL is not defined');
    }

    this.client = new Redis(url);
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  getClient() {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
      return;
    }

    await this.client.set(key, value);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) {
      await this.client.del(...keys);
    }
  }

  async delByPattern(pattern: string): Promise<void> {
    const keys = await this.client.keys(pattern);

    if (keys.length) {
      await this.client.del(...keys);
    }
  }
}
