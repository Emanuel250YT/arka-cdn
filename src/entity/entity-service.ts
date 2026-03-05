/**
 * EntityService – thin, typed facade over Arkiv entity operations.
 *
 * Access via `cdn.entity`:
 *
 * ```ts
 * // Create
 * const { entityKey } = await cdn.entity.create({
 *   payload: jsonToPayload({ hello: 'world' }),
 *   contentType: 'application/json',
 *   attributes: [{ key: 'type', value: 'note' }],
 *   expiresIn: ExpirationTime.fromDays(7),
 * })
 *
 * // Read
 * const entity = await cdn.entity.get(entityKey)
 *
 * // Query
 * const results = await cdn.entity.query()
 *   .where(eq('type', 'note'))
 *   .withPayload(true)
 *   .fetch()
 *
 * // Watch
 * const stop = await cdn.entity.watch({
 *   onCreated: e => console.log('new entity', e.entityKey),
 *   pollingInterval: 2000,
 * })
 * stop() // unsubscribe
 * ```
 */

import type {
  CreateEntityParameters,
  CreateEntityReturnType,
  DeleteEntityParameters,
  DeleteEntityReturnType,
  Entity,
  ExtendEntityParameters,
  ExtendEntityReturnType,
  Hex,
  MutateEntitiesParameters,
  MutateEntitiesReturnType,
  PublicArkivClient,
  UpdateEntityParameters,
  UpdateEntityReturnType,
} from '@arkiv-network/sdk'
import { QueryBuilder } from '@arkiv-network/sdk/query'
import type { ExtendEntityOptions, WatchEntityOptions } from '../types.js'
import type { WalletPool } from '../upload/wallet-pool.js'
import { ArkaCDNEntityError } from '../errors.js'
import { EntityWatcher } from './entity-watcher.js'
import type { WatcherOptions } from './entity-watcher.js'

/** Wraps a promise, rethrowing all failures as {@link ArkaCDNEntityError}. */
async function wrapEntityOp<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ArkaCDNEntityError) throw err
    throw new ArkaCDNEntityError(
      err instanceof Error ? err.message : `Entity operation '${operation}' failed`,
      { cause: err, operation },
    )
  }
}

export class EntityService {
  constructor(
    private readonly pool: WalletPool,
    private readonly publicClient: PublicArkivClient,
  ) { }

  // ── Write operations (routed through the wallet pool) ──────────────────────

  /**
   * Creates a new entity on-chain.
   *
   * @example
   * ```ts
   * const { entityKey, txHash } = await cdn.entity.create({
   *   payload: jsonToPayload({ message: 'Hello!' }),
   *   contentType: 'application/json',
   *   attributes: [{ key: 'type', value: 'greeting' }],
   *   expiresIn: ExpirationTime.fromMinutes(30),
   * })
   * ```
   */
  create(params: CreateEntityParameters): Promise<CreateEntityReturnType> {
    return wrapEntityOp('create', () => this.pool.run(w => w.createEntity(params)))
  }

  /**
   * Updates the payload / attributes / TTL of an existing entity.
   *
   * @example
   * ```ts
   * const { txHash } = await cdn.entity.update({
   *   entityKey: '0x...',
   *   payload: jsonToPayload({ message: 'Updated!' }),
   *   contentType: 'application/json',
   *   attributes: [{ key: 'type', value: 'greeting' }, { key: 'updated', value: Date.now() }],
   *   expiresIn: ExpirationTime.fromHours(24),
   * })
   * ```
   */
  update(params: UpdateEntityParameters): Promise<UpdateEntityReturnType> {
    return wrapEntityOp('update', () => this.pool.run(w => w.updateEntity(params)))
  }

  /**
   * Permanently removes an entity from the chain.
   *
   * @example
   * ```ts
   * const { txHash } = await cdn.entity.delete({ entityKey: '0x...' })
   * ```
   */
  delete(params: DeleteEntityParameters): Promise<DeleteEntityReturnType> {
    return wrapEntityOp('delete', () => this.pool.run(w => w.deleteEntity(params)))
  }

  /**
   * Extends the lifetime of an existing entity.
   * `additionalTime` is in seconds – use `ExpirationTime` helpers for readability.
   *
   * @example
   * ```ts
   * import { ExpirationTime } from '@arkiv-network/sdk/utils'
   * const { txHash } = await cdn.entity.extend({
   *   entityKey: '0x...',
   *   additionalTime: ExpirationTime.fromDays(7),
   * })
   * ```
   */
  extend(params: ExtendEntityOptions): Promise<ExtendEntityReturnType> {
    const sdkParams: ExtendEntityParameters = {
      entityKey: params.entityKey,
      expiresIn: params.additionalTime,
    }
    return wrapEntityOp('extend', () => this.pool.run(w => w.extendEntity(sdkParams)))
  }

  /**
   * Executes multiple create / update / delete / extend operations in a
   * **single on-chain transaction**.
   *
   * Prefer this over calling individual methods when you need to batch
   * operations for a single wallet to avoid nonce conflicts.
   *
   * @example
   * ```ts
   * const { createdEntities, txHash } = await cdn.entity.batch({
   *   creates: Array.from({ length: 5 }, (_, i) => ({
   *     payload: jsonToPayload({ index: i }),
   *     contentType: 'application/json',
   *     attributes: [{ key: 'index', value: i }],
   *     expiresIn: ExpirationTime.fromMinutes(30),
   *   })),
   * })
   * ```
   */
  batch(params: MutateEntitiesParameters): Promise<MutateEntitiesReturnType> {
    return wrapEntityOp('batch', () => this.pool.run(w => w.mutateEntities(params)))
  }

  // ── Read operations (use the public client, no wallet required) ───────────

  /**
   * Fetches a single entity by its on-chain key.
   *
   * @example
   * ```ts
   * const entity = await cdn.entity.get('0x...')
   * console.log(entity.toJson())
   * ```
   */
  get(key: Hex): Promise<Entity> {
    return wrapEntityOp('get', () => this.publicClient.getEntity(key))
  }

  /**
   * Returns a {@link QueryBuilder} for filtering entities by attributes,
   * ownership, payload, etc.
   *
   * @example
   * ```ts
   * import { eq, gt } from '@arkiv-network/sdk/query'
   *
   * const results = await cdn.entity.query()
   *   .where(eq('type', 'note'))
   *   .where(gt('created', 1672531200))
   *   .withPayload(true)
   *   .withAttributes(true)
   *   .fetch()
   *
   * for (const entity of results.entities) {
   *   console.log(entity.toJson())
   * }
   * ```
   */
  query(): QueryBuilder {
    try {
      return this.publicClient.buildQuery()
    } catch (err) {
      throw new ArkaCDNEntityError(
        err instanceof Error ? err.message : 'Failed to build query',
        { cause: err, operation: 'query' },
      )
    }
  }

  /**
   * Returns an {@link EntityWatcher} with a fluent `.on()` / `.off()` / `.once()` API.
   * Call `.start()` to begin listening and `.stop()` to unsubscribe.
   *
   * @example
   * ```ts
   * const watcher = cdn.entity.watch({ pollingInterval: 2_000 })
   *
   * watcher
   *   .on('created', e => console.log('New entity:', e.entityKey))
   *   .on('updated', e => console.log('Updated:',    e.entityKey))
   *   .on('deleted', e => console.log('Deleted:',    e.entityKey))
   *   .on('error',   e => console.error(e))
   *
   * await watcher.start()
   *
   * // Later…
   * watcher.stop()
   * ```
   *
   * You can also chain the whole setup:
   * ```ts
   * const watcher = await cdn.entity
   *   .watch({ pollingInterval: 1_000 })
   *   .on('created', handler)
   *   .start()
   * ```
   */
  watch(options?: WatcherOptions): EntityWatcher {
    return new EntityWatcher(this.publicClient, options)
  }
}
