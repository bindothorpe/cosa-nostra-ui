interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class TokenBucket {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {}

  allow(key: string, cost = 1, now = Date.now()): boolean {
    const bucket = this.buckets.get(key) ?? {
      tokens: this.capacity,
      updatedAt: now,
    };

    const elapsedSeconds = Math.max(0, now - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + elapsedSeconds * this.refillPerSecond,
    );
    bucket.updatedAt = now;

    if (bucket.tokens < cost) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.tokens -= cost;
    this.buckets.set(key, bucket);
    return true;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  prune(now = Date.now(), maxIdleMs = 10 * 60_000): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt > maxIdleMs) {
        this.buckets.delete(key);
      }
    }
  }
}

export class FixedWindowLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const window = this.windows.get(key);
    if (!window || now >= window.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (window.count >= this.limit) return false;
    window.count += 1;
    return true;
  }

  prune(now = Date.now()): void {
    for (const [key, window] of this.windows) {
      if (now >= window.resetAt) this.windows.delete(key);
    }
  }
}
