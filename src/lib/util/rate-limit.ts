// Sliding-window rate limiter.
//
// In-process only. Use to gate calls to a rate-limited external API when
// running scripts or a single Node worker. When we move to a distributed
// worker pool (pg-boss, multiple processes), swap to a Redis or database
// backed limiter.
//
// Usage:
//   const haiku = new SlidingWindowLimiter(45, 60_000);
//   await haiku.acquire();
//   // ...make the API call...
//
// Multiple concurrent callers will queue inside acquire() and exit in
// order, paced so that no more than `maxPerWindow` exits happen within
// any rolling `windowMs`.

export class SlidingWindowLimiter {
  private timestamps: number[] = [];
  /** FIFO queue of pending callers, resolved in order as slots open. */
  private waiting: Array<() => void> = [];

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number
  ) {
    if (maxPerWindow < 1) throw new Error('maxPerWindow must be >= 1');
    if (windowMs < 1) throw new Error('windowMs must be >= 1');
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.waiting.push(resolve);
      this.drain();
    });
  }

  /** How many calls fit in the current window right now. Mainly for tests/metrics. */
  available(): number {
    this.prune();
    return Math.max(0, this.maxPerWindow - this.timestamps.length);
  }

  private prune(): void {
    const cutoff = Date.now() - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0] <= cutoff) {
      this.timestamps.shift();
    }
  }

  private drain(): void {
    this.prune();
    while (this.waiting.length > 0 && this.timestamps.length < this.maxPerWindow) {
      const resolve = this.waiting.shift();
      if (!resolve) break;
      this.timestamps.push(Date.now());
      resolve();
    }

    if (this.waiting.length > 0 && this.timestamps.length >= this.maxPerWindow) {
      // Schedule a wake-up for when the oldest in-window call ages out.
      const oldest = this.timestamps[0];
      const waitMs = Math.max(0, this.windowMs - (Date.now() - oldest)) + 5;
      setTimeout(() => this.drain(), waitMs);
    }
  }
}
