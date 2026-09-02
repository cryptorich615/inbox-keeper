export declare class SlidingLimit {
    private limit;
    private windowMs;
    private hits;
    constructor(limit: number, windowMs: number);
    check(key: string): void;
}
export declare class BoundedQueue {
    private concurrency;
    private maxPending;
    private active;
    private pending;
    constructor(concurrency?: number, maxPending?: number);
    run<T>(work: () => Promise<T>): Promise<T>;
}
export declare function retryDelay(attempt: number, base?: number, cap?: number, jitter?: () => number): number;
