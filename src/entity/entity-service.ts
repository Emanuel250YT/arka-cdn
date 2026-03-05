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
import { DEFAULT_CHUNK_SIZE, split } from '../upload/chunker.js'
import { generateUUID } from '../utils/uuid.js'
import { toPayload } from '../upload/uploader.js'

/** `arkiv-cdn` content-type for auto-chunked entity manifests. */
const CHUNKED_ENTITY_CATEGORY = 'arkiv-cdn:chunked-entity'
/** `arkiv-cdn` content-type for individual chunk entities. */
const CHUNK_CATEGORY = 'arkiv-cdn:chunk'

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
   * If the payload exceeds 64 KB (the Arkiv network payload limit) it is
   * automatically split into multiple chunk entities. A lightweight manifest
   * entity is stored as the "root" and its key is returned as `entityKey` —
   * the caller never needs to handle chunking manually.
   *
   * Each chunk entity carries the attributes:
   *  - `cdn.chunk`  — zero-based chunk index
   *  - `cdn.uuid`   — unique UUID of this chunk
   *  - `cdn.entity` — UUID of the parent (manifest) entity
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
    if (params.payload && params.payload.length > DEFAULT_CHUNK_SIZE)
      return this._createChunked(params)
    return wrapEntityOp('create', () => this.pool.run(w => w.createEntity(params)))
  }

  /** @internal Auto-chunks a large payload across multiple entities. */
  private async _createChunked(params: CreateEntityParameters): Promise<CreateEntityReturnType> {
    const entityId = generateUUID()
    const chunks = split(params.payload!, entityId)

    const chunkCreates = chunks.map(c => ({
      payload: toPayload({ data: Array.from(c.bytes).map(b => b.toString(16).padStart(2, '0')).join('') }),
      contentType: CHUNK_CATEGORY,
      expiresIn: params.expiresIn,
      attributes: [
        { key: 'cdn_chunk', value: c.chunk },
        { key: 'cdn_total', value: c.total },
        { key: 'cdn_uuid', value: c.uuid },
        { key: 'cdn_entity', value: c.entity },
        { key: 'cdn_encrypted', value: '0' },
      ],
    }))

    const manifestCreate = {
      payload: toPayload({
        entityId,
        totalChunks: chunks.length,
        chunkUUIDs: chunks.map(c => c.uuid),
        contentType: params.contentType,
      }),
      contentType: CHUNKED_ENTITY_CATEGORY,
      expiresIn: params.expiresIn,
      attributes: [
        ...(params.attributes ?? []),
        { key: 'cdn_entityId', value: entityId },
        { key: 'cdn_totalChunks', value: chunks.length },
        { key: 'cdn_chunked', value: '1' },
      ],
    }

    return wrapEntityOp('create', () =>
      this.pool.run(async (w) => {
        const result = await w.mutateEntities({ creates: [...chunkCreates, manifestCreate] })
        const manifestKey = result.createdEntities[result.createdEntities.length - 1]! as Hex
        return { entityKey: manifestKey, txHash: (result as unknown as { txHash: Hex }).txHash }
      }),
    )
  }

  /**
   * Updates the payload / attributes / TTL of an existing entity.
   *
   * If the new payload exceeds 64 KB it is automatically split into chunk
   * entities and the target entity's payload is replaced with a chunked
   * manifest — the entity key stays the same.
   *
   * Each chunk entity carries the attributes:
   *  - `cdn.chunk`  — zero-based chunk index
   *  - `cdn.uuid`   — unique UUID of this chunk
   *  - `cdn.entity` — UUID derived from the target entity key
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
    if (params.payload && params.payload.length > DEFAULT_CHUNK_SIZE)
      return this._updateChunked(params)
    return wrapEntityOp('update', () => this.pool.run(w => w.updateEntity(params)))
  }

  /** @internal Auto-chunks a large update payload, creating new chunk entities. */
  private async _updateChunked(params: UpdateEntityParameters): Promise<UpdateEntityReturnType> {
    const entityId = generateUUID()
    const chunks = split(params.payload!, entityId)

    const chunkCreates = chunks.map(c => ({
      payload: toPayload({ data: Array.from(c.bytes).map(b => b.toString(16).padStart(2, '0')).join('') }),
      contentType: CHUNK_CATEGORY,
      expiresIn: params.expiresIn,
      attributes: [
        { key: 'cdn_chunk', value: c.chunk },
        { key: 'cdn_total', value: c.total },
        { key: 'cdn_uuid', value: c.uuid },
        { key: 'cdn_entity', value: c.entity },
        { key: 'cdn_encrypted', value: '0' },
      ],
    }))

    const manifestPayload = toPayload({
      entityId,
      totalChunks: chunks.length,
      chunkUUIDs: chunks.map(c => c.uuid),
      contentType: params.contentType,
    })

    const manifestAttributes = [
      ...(params.attributes ?? []),
      { key: 'cdn_entityId', value: entityId },
      { key: 'cdn_totalChunks', value: chunks.length },
      { key: 'cdn_chunked', value: '1' },
    ]

    return wrapEntityOp('update', () =>
      this.pool.run(async (w) => {
        const result = await w.mutateEntities({
          creates: chunkCreates,
          updates: [{
            entityKey: params.entityKey,
            payload: manifestPayload,
            contentType: CHUNKED_ENTITY_CATEGORY,
            expiresIn: params.expiresIn,
            attributes: manifestAttributes,
          }],
        })
        return { entityKey: params.entityKey, txHash: (result as unknown as { txHash: Hex }).txHash }
      }),
    )
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
