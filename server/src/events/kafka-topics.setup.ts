import { Kafka } from 'kafkajs';
import { KAFKA_TOPICS } from './kafka.topics';

export async function ensureKafkaTopics(
  kafka: Kafka,
  log?: (message: string) => void,
) {
  const admin = kafka.admin();
  await admin.connect();

  try {
    const created = await admin.createTopics({
      waitForLeaders: true,
      topics: [
        {
          topic: KAFKA_TOPICS.ORDER_PLACED,
          numPartitions: 1,
          replicationFactor: 1,
        },
        {
          topic: KAFKA_TOPICS.ORDER_STATUS_CHANGED,
          numPartitions: 1,
          replicationFactor: 1,
        },
      ],
    });

    log?.(
      created
        ? 'Created Kafka topics order.placed, order.status.changed'
        : 'Kafka topics already exist',
    );
  } finally {
    await admin.disconnect();
  }
}
