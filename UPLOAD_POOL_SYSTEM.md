# Upload Pool System - Persistent Background Processing

## 🎯 Objetivo

Sistema de colas persistentes que procesan chunks **secuencialmente** (1 a la vez por wallet) para eliminar errores de nonce. Las colas **nunca se detienen** y acumulan chunks de múltiples requests simultáneos.

## 🏗️ Arquitectura

### Componentes

1. **UploadPoolService** (`upload-pool.service.ts`)
   - **Servicio persistente** que inicia al arrancar la aplicación
   - Mantiene colas independientes por wallet **corriendo en segundo plano**
   - Cada cola procesa chunks secuencialmente (1 a la vez) en un **loop infinito**
   - Espera nuevos chunks cuando la cola está vacía (no se detiene)

2. **UploadService** (`upload.service.ts`)
   - Delega chunks al `UploadPoolService` (solo agrega a colas, no ejecuta)
   - Monitorea el progreso de forma asíncrona
   - Actualiza el estado del archivo cuando se completa

## 🔄 Flujo de Trabajo

### 1. Inicialización del Sistema

```typescript
Servidor inicia → UploadPoolService.onModuleInit()
  ├─ Carga wallets (desde wallets.json o .env)
  ├─ Crea colas vacías por cada wallet
  └─ Inicia processQueue() en cada cola (loop infinito)

[Queue 1] Background processor started (wallet: 0xA5D2...)
[Queue 2] Background processor started (wallet: 0xb4b2...)
...
↓ Esperando chunks (polling cada 500ms)
```

### 2. Múltiples Requests Simultáneos

**Ejemplo**: 10 POST requests con diferentes tamaños

```typescript
POST #1: 10 chunks  → addChunks() → Distribuye en colas
POST #2: 40 chunks  → addChunks() → Agrega a colas existentes
POST #3: 20 chunks  → addChunks() → Agrega a colas existentes
POST #4: 10 chunks  → addChunks() → Agrega a colas existentes
...

Queue 1: [chunk0_file1, chunk0_file2, chunk0_file3, chunk0_file4, ...]
Queue 2: [chunk1_file1, chunk1_file2, chunk1_file3, chunk1_file4, ...]

↓ Las colas procesan TODO secuencialmente, sin importar de qué archivo
```

### 3. Distribución de Chunks

```typescript
UploadPoolService.addChunks(chunks, metadata)
  - Solo AGREGA chunks a las colas existentes
  - NO inicia procesamiento (ya está corriendo en background)
  - Distribución round-robin: chunk[i] → queue[i % walletCount]

  Ejemplo con 2 wallets:
  - Chunk 0, 2, 4, 6... → Queue 1
  - Chunk 1, 3, 5, 7... → Queue 2
```

### 4. Procesamiento Persistente

**Loop infinito por cada wallet**:

### 4. Procesamiento Persistente

**Loop infinito por cada wallet**:

```typescript
async processQueue(queueIndex) {
  while (true) {  // ← NUNCA TERMINA
    if (queue.length === 0) {
      await sleep(500ms);  // Espera nuevos chunks
      continue;
    }

    const chunk = queue.shift();
    await uploadChunk(chunk);  // 1 a la vez, secuencial
    await sleep(100ms);        // Rate limiting
  }
}
```

**Comportamiento**:

- ✅ Colas siempre activas, nunca se detienen
- ✅ Procesan chunks de múltiples archivos en orden de llegada
- ✅ Sin conflictos de nonce (1 transacción activa por wallet)
- ✅ Acumulan chunks de requests simultáneos

### 5. Ejemplo con Múltiples Requests

**Escenario**: 10 POST simultáneos

```
T=0s: POST #1 (10 chunks)
  Queue 1: [0₁, 2₁, 4₁, 6₁, 8₁]           (5 chunks)
  Queue 2: [1₁, 3₁, 5₁, 7₁, 9₁]           (5 chunks)

T=1s: POST #2 (40 chunks) - SE ACUMULAN
  Queue 1: [0₁, 2₁, 4₁, 6₁, 8₁, 0₂, 2₂, 4₂...]  (25 chunks)
  Queue 2: [1₁, 3₁, 5₁, 7₁, 9₁, 1₂, 3₂, 5₂...]  (25 chunks)

T=2s: POST #3 (20 chunks) - SE ACUMULAN
  Queue 1: [... (chunks anteriores), 0₃, 2₃, 4₃...]  (35 chunks)
  Queue 2: [... (chunks anteriores), 1₃, 3₃, 5₃...]  (35 chunks)

↓ Las colas procesan TODO en orden, sin importar el archivo origen
Queue 1: chunk 0₁ → chunk 2₁ → chunk 4₁ → chunk 0₂ → chunk 2₂ → ...
Queue 2: chunk 1₁ → chunk 3₁ → chunk 5₁ → chunk 1₂ → chunk 3₂ → ...
```

**Ventajas**:

- Sin errores de nonce (cada wallet solo 1 tx activa)
- Requests no bloquean (retornan inmediatamente)
- Chunks se procesan en orden de llegada (FIFO por cola)
- Throughput aumenta con más wallets

### 6. Retry Logic

Si un chunk falla:

- Se actualiza `retryCount` en DB
- Se marca como `retrying`
- Se vuelve a agregar al final de la misma cola
- Máximo 10 reintentos
- Si falla 10 veces → marca como `failed`

### 6. Retry Logic

Si un chunk falla:

- Se actualiza `retryCount` en DB
- Se marca como `retrying`
- Se vuelve a agregar **al final de la misma cola**
- Máximo 10 reintentos
- Si falla 10 veces → marca como `failed`

### 7. Monitoreo

```typescript
monitorUploadStatus(fileId, totalChunks)
  - Verifica cada 5 segundos
  - Cuenta: completed, failed, pending
  - Actualiza File.uploadStatus cuando termine:
    * completed: todos exitosos
    * partial: algunos fallaron
    * failed: timeout o error crítico
```

## 📊 Ejemplo Completo: 10 POST Simultáneos

### Escenario Real

```
POST #1:  10 chunks (File A)
POST #2:  40 chunks (File B)
POST #3:  20 chunks (File C)
POST #4:  10 chunks (File D)
POST #5:  30 chunks (File E)
POST #6:  15 chunks (File F)
POST #7:  50 chunks (File G)
POST #8:   5 chunks (File H)
POST #9:  25 chunks (File I)
POST #10: 45 chunks (File J)

Total: 250 chunks
Wallets: 2
```

### Distribución en Colas (Round-Robin)

```
Queue 1 (125 chunks):
  [A0, A2, A4, A6, A8,                    ← File A (5)
   B0, B2, B4, B6, ..., B38,              ← File B (20)
   C0, C2, C4, ..., C18,                  ← File C (10)
   D0, D2, D4, D6, D8,                    ← File D (5)
   E0, E2, E4, ..., E28,                  ← File E (15)
   ... todos los chunks pares]

Queue 2 (125 chunks):
  [A1, A3, A5, A7, A9,                    ← File A (5)
   B1, B3, B5, B7, ..., B39,              ← File B (20)
   C1, C3, C5, ..., C19,                  ← File C (10)
   D1, D3, D5, D7, D9,                    ← File D (5)
   E1, E3, E5, ..., E29,                  ← File E (15)
   ... todos los chunks impares]
```

### Timeline de Procesamiento

```
T=0s: Sistema inicia
  [Queue 1] Background processor started
  [Queue 2] Background processor started
  ↓ Esperando chunks...

T=1s: 10 POST requests llegan
  [UploadPoolService] Adding 10 chunks to pool for file A
  [UploadPoolService] Adding 40 chunks to pool for file B
  [UploadPoolService] Adding 20 chunks to pool for file C
  ...
  [UploadPoolService]   Queue 1: 125 chunk(s) pending
  [UploadPoolService]   Queue 2: 125 chunk(s) pending

T=1.1s: Procesamiento comienza
  [Queue 1] Processing chunk 1/10 for file A (chunk A0)
  [Queue 2] Processing chunk 2/10 for file A (chunk A1)

T=1.2s:
  [Queue 1] Chunk 1/10 uploaded - Key: 0x123...
  [Queue 1] Processing chunk 3/10 for file A (chunk A2)
  [Queue 2] Chunk 2/10 uploaded - Key: 0x456...
  [Queue 2] Processing chunk 4/10 for file A (chunk A3)

T=2s: File A completado, continúa con File B
  [Queue 1] Processing chunk 1/40 for file B (chunk B0)
  [Queue 2] Processing chunk 2/40 for file B (chunk B1)

...

T=250s: Todos los chunks procesados
  [Queue 1] Finished 125 chunks. Success: 125, Failures: 0
  [Queue 2] Finished 125 chunks. Success: 125, Failures: 0
  ↓ Colas vuelven a esperar nuevos chunks (no se detienen)
```

## 📊 Ejemplo Real: 600 Chunks, 2 Wallets (Archivo Grande)

### Distribución Inicial

```
Total chunks: 600
Wallets: 2

Queue 1 (Wallet 1): 300 chunks [0, 2, 4, 6, ..., 598]
Queue 2 (Wallet 2): 300 chunks [1, 3, 5, 7, ..., 599]
```

### Timeline de Procesamiento

```
T=0s:
  Queue 1: Procesando chunk 0
  Queue 2: Procesando chunk 1

T=2s:
  Queue 1: ✅ Chunk 0 completado → Procesando chunk 2
  Queue 2: ✅ Chunk 1 completado → Procesando chunk 3

T=4s:
  Queue 1: ✅ Chunk 2 completado → Procesando chunk 4
  Queue 2: ✅ Chunk 3 completado → Procesando chunk 5

...

T=600s (aprox):
  Queue 1: ✅ Todos los 300 chunks completados
  Queue 2: ✅ Todos los 300 chunks completados

  → File.uploadStatus = "completed"
```

### Logs Esperados

```
[UploadPoolService] Upload Pool initialized with 2 wallet queue(s)
[UploadPoolService]   Queue 1: 0xA5D2fe025b74d02DB9c43EA36333B8754daF766d
[UploadPoolService]   Queue 2: 0xb4b277095Ef92243EF4B3A5d69F19794871d9954

[UploadPoolService] Adding 600 chunks to pool for file abc-123 (2 wallet(s))
[UploadPoolService]   Queue 1 (0xA5D2...): 300 chunk(s) pending
[UploadPoolService]   Queue 2 (0xb4b2...): 300 chunk(s) pending

[UploadPoolService] [Queue 1] Processing chunk 1/600 for file abc-123
[UploadPoolService] [Queue 2] Processing chunk 2/600 for file abc-123
[UploadPoolService] [Queue 1] Chunk 1/600 uploaded - Key: 0x123abc...
[UploadPoolService] [Queue 2] Chunk 2/600 uploaded - Key: 0x456def...

[UploadPoolService] [Queue 1] Processing chunk 3/600 for file abc-123
[UploadPoolService] [Queue 2] Processing chunk 4/600 for file abc-123
...

[UploadPoolService] [Queue 1] Finished processing. Success: 300, Failures: 0
[UploadPoolService] [Queue 2] Finished processing. Success: 300, Failures: 0

[UploadService] File abc-123 upload completed successfully
```

## 🔍 Verificación

### 1. Endpoint de Stats

```bash
GET http://localhost:3000/upload/stats/wallet-pool

Response:
{
  "success": true,
  "data": {
    "totalWallets": 2,
    "queues": [
      {
        "queueIndex": 1,
        "walletAddress": "0xA5D2fe025b74d02DB9c43EA36333B8754daF766d",
        "pendingChunks": 150,
        "isProcessing": true,
        "successCount": 150,
        "failureCount": 0
      },
      {
        "queueIndex": 2,
        "walletAddress": "0xb4b277095Ef92243EF4B3A5d69F19794871d9954",
        "pendingChunks": 150,
        "isProcessing": true,
        "successCount": 150,
        "failureCount": 0
      }
    ]
  }
}
```

### 2. Endpoint de Status

```bash
GET http://localhost:3000/upload/:fileId/status

Response:
{
  "success": true,
  "data": {
    "fileId": "abc-123",
    "uploadStatus": "uploading",
    "totalChunks": 600,
    "completedChunks": 300,
    "failedChunks": 0,
    "progress": 50.0
  }
}
```

## ✅ Ventajas del Sistema

1. **Sin errores de nonce**
   - Cada wallet procesa 1 chunk a la vez → nonce siempre en orden
2. **Distribución equitativa**
   - Chunks se reparten uniformemente entre wallets
   - Con 5 wallets y 600 chunks → 120 chunks por wallet

3. **Retry automático**
   - Hasta 10 reintentos por chunk
   - Mantiene la misma wallet para reintentos

4. **Monitoreo en tiempo real**
   - Endpoint de stats muestra colas en vivo
   - Endpoint de status muestra progreso por archivo

5. **Escalable**
   - Agregar más wallets → más throughput
   - Sin cambios en código, solo actualizar `wallets.json`

## 🚀 Comandos

### Generar Wallets

```powershell
node ./scripts/generate-wallets.js 5
```

### Iniciar Servidor

```powershell
npm run start:dev
```

### Verificar Pool

```powershell
# PowerShell
Invoke-RestMethod http://localhost:3000/upload/stats/wallet-pool

# O con curl
curl http://localhost:3000/upload/stats/wallet-pool
```

### Verificar Upload

```powershell
Invoke-RestMethod "http://localhost:3000/upload/{fileId}/status"
```

## 🎯 Resolución del Problema Original

**Problema**: 60+ chunks causaban errores de nonce al subir en paralelo

**Solución**:

- ✅ Procesamiento secuencial por wallet (1 a la vez)
- ✅ Distribución equitativa entre múltiples wallets
- ✅ Sin conflictos de nonce
- ✅ Throughput aumenta con más wallets

**Ejemplo**:

- 60 chunks, 1 wallet → 60 transacciones secuenciales (~120s)
- 60 chunks, 5 wallets → 12 transacciones secuenciales por wallet (~24s)
- 600 chunks, 5 wallets → 120 transacciones secuenciales por wallet (~240s)

## 📝 Notas Importantes

1. **No modificar `walletClients` en `UploadService`**
   - Solo se usa para `simpleUploadToArkiv()` (videos DASH)
   - Los uploads normales usan `UploadPoolService`

2. **Monitoreo asíncrono**
   - No bloquea la respuesta HTTP
   - Actualiza DB cuando detecta completado/fallido

3. **Colas persistentes**
   - Si el servidor se reinicia, los chunks en cola se pierden
   - Considerar persistencia en Redis/DB para producción

4. **Rate limiting**
   - Delay de 100ms entre chunks (configurable)
   - Previene sobrecarga del blockchain
