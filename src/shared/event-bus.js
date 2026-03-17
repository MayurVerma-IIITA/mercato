import { randomUUID } from "node:crypto";

export class EventBus {
  constructor({ latencyMs = 50 } = {}) {
    this.latencyMs = latencyMs;
    this.subscribers = new Map();
    this.metrics = {
      published: 0,
      delivered: 0,
      lastPublishedAt: null,
      propagationDelaysMs: []
    };
  }

  subscribe(topic, handler) {
    const handlers = this.subscribers.get(topic) || [];
    handlers.push(handler);
    this.subscribers.set(topic, handlers);

    return () => {
      const current = this.subscribers.get(topic) || [];
      this.subscribers.set(
        topic,
        current.filter((item) => item !== handler)
      );
    };
  }

  async publish(topic, payload) {
    const event = {
      id: randomUUID(),
      topic,
      publishedAt: new Date().toISOString(),
      payload
    };

    this.metrics.published += 1;
    this.metrics.lastPublishedAt = event.publishedAt;
    const handlers = this.subscribers.get(topic) || [];

    await Promise.all(
      handlers.map(
        (handler) =>
          new Promise((resolve) => {
            setTimeout(async () => {
              const startedAt = Date.now();
              await handler(event);
              this.metrics.delivered += 1;
              this.metrics.propagationDelaysMs.push(Date.now() - startedAt + this.latencyMs);
              if (this.metrics.propagationDelaysMs.length > 500) {
                this.metrics.propagationDelaysMs.shift();
              }
              resolve();
            }, this.latencyMs);
          })
      )
    );

    return event;
  }

  snapshot() {
    const delays = this.metrics.propagationDelaysMs;
    const averageDelayMs =
      delays.length === 0
        ? 0
        : Math.round(delays.reduce((sum, value) => sum + value, 0) / delays.length);

    return {
      published: this.metrics.published,
      delivered: this.metrics.delivered,
      lastPublishedAt: this.metrics.lastPublishedAt,
      averagePropagationDelayMs: averageDelayMs,
      targetThroughputPerDay: 5000,
      targetPropagationSlaMs: 2000
    };
  }
}
