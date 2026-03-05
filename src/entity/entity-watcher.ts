/**
 * EntityWatcher – live entity event subscription with a fluent event-listener API.
 *
 * Unlike the old callback-based `watch()`, `EntityWatcher` lets you add and
 * remove typed handlers at any point before **or** after calling `.start()`.
 *
 * @example
 * ```ts
 * const watcher = cdn.entity.watch({ pollingInterval: 2_000 })
 *
 * watcher
 *   .on('created', e => console.log('New entity:', e.entityKey))
 *   .on('updated', e => console.log('Updated:',    e.entityKey))
 *   .on('deleted', e => console.log('Deleted:',    e.entityKey))
 *   .on('error',   e => console.error('Watch error:', e))
 *
 * await watcher.start() // begin polling the chain
 *
 * // … later …
 * watcher.stop()
 * ```
 */

import type {
  OnEntityCreatedEvent,
  OnEntityDeletedEvent,
  OnEntityExpiredEvent,
  OnEntityExpiresInExtendedEvent,
  OnEntityUpdatedEvent,
  PublicArkivClient,
} from '@arkiv-network/sdk'

// ── Event map ─────────────────────────────────────────────────────────────────

/**
 * All events that can be emitted by an {@link EntityWatcher}.
 * Use these string literals with `.on()`, `.off()`, and `.once()`.
 */
export interface WatcherEventMap {
  /** Fired when a new entity is created on-chain. */
  created: OnEntityCreatedEvent
  /** Fired when an existing entity's payload / attributes are updated. */
  updated: OnEntityUpdatedEvent
  /** Fired when an entity is deleted. */
  deleted: OnEntityDeletedEvent
  /** Fired when an entity's TTL expires. */
  expired: OnEntityExpiredEvent
  /** Fired when an entity's expiry is extended. */
  expiresInExtended: OnEntityExpiresInExtendedEvent
  /** Fired when the underlying subscription encounters a network error. */
  error: Error
}

/** Configuration passed to `cdn.entity.watch()`. */
export interface WatcherOptions {
  /**
   * How often the SDK polls the chain for new events, in milliseconds.
   * @default 2000
   */
  pollingInterval?: number
  /** Start listening from this block number (defaults to the latest block). */
  fromBlock?: bigint
}

// ── Internal types ────────────────────────────────────────────────────────────

type Handler<T> = (data: T) => void

// ── EntityWatcher ─────────────────────────────────────────────────────────────

/**
 * A live subscription to on-chain entity events.
 *
 * - Call `.on(event, handler)` to register listeners *(chainable)*
 * - Call `.off(event, handler)` to remove them *(chainable)*
 * - Call `.once(event, handler)` for a one-time listener *(chainable)*
 * - Call `await .start()` to begin receiving events
 * - Call `.stop()` to unsubscribe and release resources
 *
 * All methods (except `start` / `stop`) return `this` so they can be chained:
 * ```ts
 * await cdn.entity
 *   .watch({ pollingInterval: 1_000 })
 *   .on('created', onCreate)
 *   .on('error',   onError)
 *   .start()
 * ```
 */
export class EntityWatcher {
  private readonly _client: PublicArkivClient
  private readonly _options: WatcherOptions
  private readonly _listeners = new Map<string, Set<Handler<unknown>>>()
  private _unsubscribe: (() => void) | null = null

  /** @internal */
  constructor(client: PublicArkivClient, options: WatcherOptions = {}) {
    this._client = client
    this._options = options
  }

  // ── Listener management ────────────────────────────────────────────────────

  /**
   * Registers `handler` for `event`.
   * Can be called before or after `.start()`.
   *
   * @returns `this` — for chaining
   */
  on<K extends keyof WatcherEventMap>(
    event: K,
    handler: Handler<WatcherEventMap[K]>,
  ): this {
    let bucket = this._listeners.get(event as string)
    if (!bucket) {
      bucket = new Set()
      this._listeners.set(event as string, bucket)
    }
    bucket.add(handler as Handler<unknown>)
    return this
  }

  /**
   * Removes a previously registered `handler` for `event`.
   *
   * @returns `this` — for chaining
   */
  off<K extends keyof WatcherEventMap>(
    event: K,
    handler: Handler<WatcherEventMap[K]>,
  ): this {
    this._listeners.get(event as string)?.delete(handler as Handler<unknown>)
    return this
  }

  /**
   * Registers a handler that fires **once** for `event` and then
   * automatically removes itself.
   *
   * @returns `this` — for chaining
   */
  once<K extends keyof WatcherEventMap>(
    event: K,
    handler: Handler<WatcherEventMap[K]>,
  ): this {
    const wrapped = (data: WatcherEventMap[K]) => {
      handler(data)
      this.off(event, wrapped)
    }
    return this.on(event, wrapped)
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** `true` if the watcher is currently active. */
  get started(): boolean {
    return this._unsubscribe !== null
  }

  /**
   * Starts listening to on-chain entity events.
   * Resolves once the subscription is established.
   *
   * Calling `.start()` on an already-started watcher is a no-op.
   *
   * @returns `this` — for chaining (e.g. `await watcher.on(...).start()`)
   */
  async start(): Promise<this> {
    if (this._unsubscribe) return this

    const emit = <K extends keyof WatcherEventMap>(
      event: K,
      data: WatcherEventMap[K],
    ) => {
      this._listeners
        .get(event as string)
        ?.forEach(h => (h as Handler<WatcherEventMap[K]>)(data))
    }

    this._unsubscribe = await this._client.subscribeEntityEvents(
      {
        onEntityCreated: e => emit('created', e),
        onEntityUpdated: e => emit('updated', e),
        onEntityDeleted: e => emit('deleted', e),
        onEntityExpired: e => emit('expired', e),
        onEntityExpiresInExtended: e => emit('expiresInExtended', e),
        onError: e => emit('error', e),
      },
      this._options.pollingInterval,
      this._options.fromBlock,
    )

    return this
  }

  /**
   * Stops listening and releases the underlying subscription.
   * Safe to call multiple times.
   */
  stop(): void {
    this._unsubscribe?.()
    this._unsubscribe = null
  }
}
