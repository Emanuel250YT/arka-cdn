# ArkaCDN

A TypeScript library for storing and retrieving files on the **Arkiv network**.
Works in **Node.js 18+** and modern **browsers** (Chromium, Firefox, Safari).

All Arkiv SDK helpers — `createPublicClient`, `createWalletClient`, `http`,
`custom`, `privateKeyToAccount`, `kaolin`, `ExpirationTime`, `eq`, and more —
are **re-exported directly from `arka-cdn`**.  
You only need one install.

## Features

- **Single install** — `@arkiv-network/sdk` is bundled; import everything from `arka-cdn`
- **Namespace API** — `cdn.entity.*` for low-level ops · `cdn.file.*` for file CDN
- **Native gzip compression** — `compress: true` for text/JSON; `compress: 'auto'` skips pre-compressed formats (video, JPEG …) automatically
- **Live entity events** — fluent `EntityWatcher` with `.on()` / `.off()` / `.once()` / `.start()` / `.stop()`
- **64 KB chunks** — files split into ≤ 64 KB pieces, reassembled transparently
- **Multi-wallet pool** — round-robin nonce distribution avoids conflicts, maximises throughput
- **Batch uploads** — all chunks for one wallet land in a single `mutateEntities` transaction
- **P2P AES-256-CBC encryption** — PBKDF2 / SHA-256, 100 k iterations; `phrase + secret` pair
- **MetaMask / browser wallets** — pass any `WalletArkivClient` built with `custom(window.ethereum)`
- **Full entity CRUD** — create, update, delete, extend, batch-mutate, query, watch
- **Typed errors** — `ArkaCDNError`, `ArkaCDNUploadError`, `ArkaCDNDownloadError`, `ArkaCDNEntityError`
- **TypeScript-first** — dual ESM / CJS output with full `.d.ts` declarations

---

## Installation

```bash
npm install arka-cdn
# or
pnpm add arka-cdn
```

---

## Quick Start

### Browser / MetaMask

```ts
import {
  ArkaCDN,
  createPublicClient,
  createWalletClient,
  custom,
  http,
  kaolin,
} from "arka-cdn";

await window.ethereum.request({ method: "eth_requestAccounts" });

const cdn = ArkaCDN.create({
  publicClient: createPublicClient({ chain: kaolin, transport: http() }),
  wallets: createWalletClient({
    chain: kaolin,
    transport: custom(window.ethereum),
  }),
});

// Upload a file from <input type="file">
const [file] = fileInput.files!;
const { manifestKey } = await cdn.file.upload(file);

// Download it later
const { data, filename, mimeType } = await cdn.file.download(manifestKey);
```

### Node.js (private key)

```ts
import {
  ArkaCDN,
  createPublicClient,
  createWalletClient,
  http,
  kaolin,
  privateKeyToAccount,
} from "arka-cdn";
import { readFileSync } from "node:fs";

const cdn = ArkaCDN.create({
  publicClient: createPublicClient({ chain: kaolin, transport: http() }),
  wallets: createWalletClient({
    account: privateKeyToAccount(process.env.PRIVATE_KEY!),
    chain: kaolin,
    transport: http(),
  }),
});

const buf = readFileSync("image.png");
const { manifestKey } = await cdn.file.upload(buf, {
  filename: "image.png",
  mimeType: "image/png",
});
```

### Multi-wallet (parallel uploads)

```ts
const cdn = ArkaCDN.create({
  publicClient: createPublicClient({ chain: kaolin, transport: http() }),
  wallets: [key1, key2, key3].map((key) =>
    createWalletClient({
      account: privateKeyToAccount(key),
      chain: kaolin,
      transport: http(),
    }),
  ),
});
```

}),
})

---

## `cdn.file` — File Operations

### Upload

```ts
const { manifestKey, entityId, chunks, size } = await cdn.file.upload(input, {
  filename: "data.json",
  mimeType: "application/json",
  // Encrypt before upload
  encryption: { phrase: "shared-phrase", secret: "private-key" },
  // Show chunk progress
  onProgress: ({ uploaded, total, ratio }) =>
    console.log(`${uploaded}/${total} (${(ratio * 100).toFixed(1)}%)`),
});
```

`input` accepts: `File` · `Blob` · `Uint8Array` · `ArrayBuffer`

### Upload with compression

```ts
// Always compress (great for text, JSON, XML, CSV …)
await cdn.file.upload(jsonBuf, {
  mimeType: "application/json",
  compress: true,
});

// Smart compression — skips already-compressed formats (video, JPEG, PNG …)
await cdn.file.upload(file, { compress: "auto" });
```

> **Video / audio files are NOT re-compressed.** H.264 / VP9 / AV1 content is
> already compressed; gzip on top makes it larger.  
> `compress: 'auto'` detects this automatically based on MIME type.

### Download

```ts
const { data, filename, mimeType, size } = await cdn.file.download(
  manifestKey,
  {
    // Required if the file was encrypted
    encryption: { phrase: "shared-phrase", secret: "private-key" },
    onProgress: ({ fetched, total }) => console.log(`${fetched}/${total}`),
  },
);

// Browser — trigger download dialog
const blob = new Blob([data], { type: mimeType });
const url = URL.createObjectURL(blob);
Object.assign(document.createElement("a"), {
  href: url,
  download: filename,
}).click();
```

Decompression happens **automatically** if the file was uploaded with `compress`.

### Inspect manifest (no chunk download)

```ts
const manifest = await cdn.file.manifest(manifestKey);
console.log(
  manifest.filename,
  manifest.size,
  manifest.totalParts,
  manifest.compressed,
);
```

---

## `cdn.entity` — Entity Operations

### Create

```ts
import { ExpirationTime, jsonToPayload } from "arka-cdn";

const { entityKey } = await cdn.entity.create({
  payload: jsonToPayload({ hello: "world" }),
  contentType: "application/json",
  attributes: [{ key: "type", value: "note" }],
  expiresIn: ExpirationTime.fromDays(7),
});
```

### Update

```ts
await cdn.entity.update({
  entityKey: "0x...",
  payload: jsonToPayload({ hello: "updated" }),
  contentType: "application/json",
  attributes: [{ key: "type", value: "note" }],
  expiresIn: ExpirationTime.fromDays(14),
});
```

### Delete

```ts
await cdn.entity.delete({ entityKey: "0x..." });
```

### Extend lifetime

```ts
await cdn.entity.extend({
  entityKey: "0x...",
  additionalTime: ExpirationTime.fromDays(7),
});
```

### Batch (single transaction)

```ts
const { createdEntities } = await cdn.entity.batch({
  creates: Array.from({ length: 10 }, (_, i) => ({
    payload: jsonToPayload({ index: i }),
    contentType: "application/json",
    attributes: [{ key: "index", value: i }],
    expiresIn: ExpirationTime.fromHours(24),
  })),
});
```

### Get

```ts
const entity = await cdn.entity.get("0x...");
console.log(entity.toJson());
```

### Query

```ts
import { eq, gt } from "arka-cdn";

const results = await cdn.entity
  .query()
  .where(eq("type", "note"))
  .where(gt("created", 1_700_000_000))
  .withPayload(true)
  .limit(20)
  .fetch();

for (const entity of results.entities) {
  console.log(entity.toJson());
}
```

### Watch — live entity events

Use the `EntityWatcher` returned by `cdn.entity.watch()`.
Register handlers with `.on()`, then call `.start()`.

```ts
const watcher = cdn.entity.watch({ pollingInterval: 2_000 });

watcher
  .on("created", (e) => console.log("New entity:", e.entityKey))
  .on("updated", (e) => console.log("Updated:", e.entityKey))
  .on("deleted", (e) => console.log("Deleted:", e.entityKey))
  .on("expired", (e) => console.log("Expired:", e.entityKey))
  .on("error", (e) => console.error("Watch error:", e));

await watcher.start(); // begin polling the chain

// Later…
watcher.stop();
```

Chainable one-liner:

```ts
const watcher = await cdn.entity
  .watch({ pollingInterval: 1_000 })
  .on("created", handler)
  .on("error", console.error)
  .start();
```

Add / remove handlers at any time:

```ts
const onCreated = (e) => console.log(e);
watcher.on("created", onCreated); // add
watcher.off("created", onCreated); // remove
watcher.once("updated", (e) => console.log("first update:", e)); // fires once
```

---

## Error Handling

All errors extend `ArkaCDNError`, so a single `catch` handles everything.

```ts
import {
  ArkaCDNError,
  ArkaCDNDownloadError,
  ArkaCDNEntityError,
  ArkaCDNUploadError,
} from "arka-cdn";

try {
  const { manifestKey } = await cdn.file.upload(file);
} catch (err) {
  if (err instanceof ArkaCDNUploadError) {
    console.error(`Chunk ${err.chunkIndex} failed:`, err.message, err.cause);
  } else if (err instanceof ArkaCDNDownloadError) {
    console.error("Download failed for", err.manifestKey, err.message);
  } else if (err instanceof ArkaCDNEntityError) {
    console.error(`Entity op '${err.operation}' failed:`, err.message);
  } else if (err instanceof ArkaCDNError) {
    console.error("ArkaCDN error:", err.message);
  } else {
    throw err;
  }
}
```

| Error class            | Extra property         | When thrown                    |
| ---------------------- | ---------------------- | ------------------------------ |
| `ArkaCDNError`         | —                      | Base class; all library errors |
| `ArkaCDNUploadError`   | `chunkIndex?: number`  | Chunk upload failure           |
| `ArkaCDNDownloadError` | `manifestKey?: string` | Chunk / manifest fetch failure |
| `ArkaCDNEntityError`   | `operation?: string`   | Entity CRUD / watch failure    |

---

## API Reference

### `ArkaCDN.create(config)`

```ts
interface ArkaCDNConfig {
  publicClient: PublicArkivClient;
  wallets: WalletArkivClient | WalletArkivClient[];
  maxChunkSize?: number; // default: 65 536 (64 KB)
  defaultExpiresIn?: number; // default: 30 days (seconds)
}
```

### Package exports

| Export                    | Description                                    |
| ------------------------- | ---------------------------------------------- |
| `ArkaCDN`                 | Main client class                              |
| `createArkaCDN(config)`   | Convenience factory                            |
| `EntityWatcher`           | Live entity event subscription                 |
| `EntityService`           | Low-level entity operations                    |
| `FileService`             | High-level CDN file operations                 |
| `ArkaCDNError`            | Base error class                               |
| `ArkaCDNUploadError`      | Upload failure                                 |
| `ArkaCDNDownloadError`    | Download failure                               |
| `ArkaCDNEntityError`      | Entity operation failure                       |
| `compress` / `decompress` | Isomorphic gzip helpers                        |
| `isCompressible`          | Returns `true` if gzip will reduce file size   |
| `DEFAULT_CHUNK_SIZE`      | `65 536` (64 KB)                               |
| `split` / `assemble`      | Chunker utilities                              |
| `encrypt` / `decrypt`     | AES-256-CBC helpers                            |
| `WalletPool`              | Wallet round-robin pool                        |
| `Uploader` / `Downloader` | Low-level I/O classes                          |
| `createPublicClient` …    | Re-exported from `@arkiv-network/sdk` (viem)   |
| `kaolin`                  | Re-exported Arkiv testnet chain                |
| `privateKeyToAccount` …   | Re-exported from `@arkiv-network/sdk/accounts` |
| `eq`, `gt`, `lt` …        | Re-exported from `@arkiv-network/sdk/query`    |
| `ExpirationTime` …        | Re-exported from `@arkiv-network/sdk/utils`    |

---

## Compression API

```ts
import { compress, decompress, isCompressible } from "arka-cdn";

// Check whether gzip will actually reduce size
isCompressible("application/json"); // true  ✅ — text compresses well
isCompressible("text/html"); // true  ✅
isCompressible("video/mp4"); // false ⛔ — already H.264 compressed
isCompressible("image/jpeg"); // false ⛔ — already DCT compressed

// Compress / decompress raw bytes
const packed = await compress(new TextEncoder().encode(bigJsonString));
const unpacked = await decompress(packed);
```

Works in the browser (`CompressionStream`) and Node.js
(`node:zlib` fallback for Node < 18).

---

## Building from source

```bash
pnpm install
pnpm build      # produces dist/
pnpm test       # vitest
pnpm typecheck  # tsc --noEmit
```

---

## License

MIT
