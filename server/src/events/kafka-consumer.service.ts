import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka, logLevel } from 'kafkajs';
import {
  OrderPlacedEvent,
  OrderStatusChangedEvent,
} from './kafka.events';
import { KAFKA_TOPICS } from './kafka.topics';
import { ensureKafkaTopics } from './kafka-topics.setup';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private kafka!: Kafka;
  private consumer!: Consumer;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const brokers = this.configService
      .get<string>('KAFKA_BROKERS', 'localhost:9092')
      .split(',')
      .map((broker) => broker.trim());

    this.kafka = new Kafka({
      clientId: `${this.configService.get<string>('KAFKA_CLIENT_ID', 'eventcart-api')}-consumer`,
      brokers,
      logLevel: logLevel.WARN,
      retry: { retries: 8 },
    });

    await ensureKafkaTopics(this.kafka, (message) =>
      this.logger.log(message),
    );

    this.consumer = this.kafka.consumer({
      groupId: this.configService.get<string>(
        'KAFKA_GROUP_ID',
        'eventcart-consumers',
      ),
    });

    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [
        KAFKA_TOPICS.ORDER_PLACED,
        KAFKA_TOPICS.ORDER_STATUS_CHANGED,
      ],
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const raw = message.value?.toString();

        if (!raw) {
          return;
        }

        if (topic === KAFKA_TOPICS.ORDER_PLACED) {
          this.handleOrderPlaced(JSON.parse(raw) as OrderPlacedEvent);
          return;
        }

        if (topic === KAFKA_TOPICS.ORDER_STATUS_CHANGED) {
          this.handleOrderStatusChanged(
            JSON.parse(raw) as OrderStatusChangedEvent,
          );
        }
      },
    });

    this.logger.log(
      `Kafka consumer subscribed to ${KAFKA_TOPICS.ORDER_PLACED}, ${KAFKA_TOPICS.ORDER_STATUS_CHANGED}`,
    );
  }

  async onModuleDestroy() {
    await this.consumer?.disconnect();
  }

  private handleOrderPlaced(event: OrderPlacedEvent) {
    this.logger.log(
      `[order.placed] ${event.orderNumber} — ${event.items.length} item(s), total $${event.total} — simulating confirmation email`,
    );
  }

  private handleOrderStatusChanged(event: OrderStatusChangedEvent) {
    this.logger.log(
      `[order.status.changed] ${event.orderNumber}: ${event.previousStatus} → ${event.newStatus} — simulating customer notification`,
    );
  }
}
