import { PublicError } from './http-security.js';
export class SlidingLimit {
    limit;
    windowMs;
    hits = new Map();
    constructor(limit, windowMs) {
        this.limit = limit;
        this.windowMs = windowMs;
    }
    check(key) { const now = Date.now(), live = (this.hits.get(key) || []).filter(x => x > now - this.windowMs); if (live.length >= this.limit)
        throw new PublicError(429, 'Rate limit exceeded'); live.push(now); this.hits.set(key, live); }
}
export class BoundedQueue {
    concurrency;
    maxPending;
    active = 0;
    pending = [];
    constructor(concurrency = 2, maxPending = 50) {
        this.concurrency = concurrency;
        this.maxPending = maxPending;
    }
    async run(work) { if (this.pending.length >= this.maxPending)
        throw new PublicError(503, 'Cleanup queue is full'); if (this.active >= this.concurrency)
        await new Promise(resolve => this.pending.push(resolve)); this.active++; try {
        return await work();
    }
    finally {
        this.active--;
        this.pending.shift()?.();
    } }
}
export function retryDelay(attempt, base = 250, cap = 8000, jitter = Math.random) { return Math.min(cap, base * 2 ** attempt) * (0.75 + jitter() * 0.5); }
