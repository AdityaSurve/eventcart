import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, logLevel } from 'kafkajs';
import { KAFKA_TOPICS } from './kafka.topics';
import { ensureKafkaTopics } from './kafka-topics.setup';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka!: Kafka;
  private producer!: Producer;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const brokers = this.configService
      .get<string>('KAFKA_BROKERS', 'localhost:9092')
      .split(',')
      .map((broker) => broker.trim());

    this.kafka = new Kafka({
      clientId: this.configService.get<string>(
        'KAFKA_CLIENT_ID',
        'eventcart-api',
      ),
      brokers,
      logLevel: logLevel.WARN,
      retry: { retries: 8 },
    });

    await ensureKafkaTopics(this.kafka, (message) =>
      this.logger.log(message),
    );

    this.producer = this.kafka.producer();
    await this.producer.connect();
    this.logger.log(`Kafka producer connected (${brokers.join(', ')})`);
  }

  async onModuleDestroy() {
    await this.producer?.disconnect();
  }

  async publish<T extends object>(
    topic: string,
    key: string,
    payload: T,
  ): Promise<void> {
    await this.producer.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(payload),
        },
      ],
    });

    this.logger.log(`Published to ${topic} (key=${key})`);
  }

  get topics() {
    return KAFKA_TOPICS;
  }
}
