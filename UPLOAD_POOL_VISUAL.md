# Ejemplo Visual: Sistema de Colas Persistentes

## 🎬 Comportamiento del Sistema

### Estado Inicial (Servidor arranca)

```
┌─────────────────────────────────────────────────────┐
│  UploadPoolService Initialized                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Queue 1 (0xA5D2...)  →  [ ]  ← ESPERANDO         │
│  Queue 2 (0xb4b2...)  →  [ ]  ← ESPERANDO         │
│                                                     │
│  Estado: Loops infinitos corriendo en background   │
│  Polling cada 500ms para nuevos chunks             │
└─────────────────────────────────────────────────────┘
```

---

### POST #1: 10 chunks (File A)

```
Tiempo: T=0s

┌─────────────────────────────────────────────────────┐
│  POST /upload/file (File A: 10 chunks)             │
│  ↓                                                  │
│  addChunks() → Distribuye a colas                  │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Queue 1:  [A0, A2, A4, A6, A8]         5 chunks   │
│  Queue 2:  [A1, A3, A5, A7, A9]         5 chunks   │
└─────────────────────────────────────────────────────┘

Queue 1: Procesa A0 → A2 → A4 → A6 → A8 (secuencial)
Queue 2: Procesa A1 → A3 → A5 → A7 → A9 (secuencial)
```

---

### POST #2: 40 chunks (File B) - MIENTRAS Queue 1 y 2 procesan File A

```
Tiempo: T=1s (Queue 1 procesando A2, Queue 2 procesando A3)

┌─────────────────────────────────────────────────────┐
│  POST /upload/file (File B: 40 chunks)             │
│  ↓                                                  │
│  addChunks() → AGREGA a colas existentes           │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  Queue 1:  [A4, A6, A8, B0, B2, B4, ..., B38]      │
│            └─────┬─────┘ └──────────┬──────────┘   │
│              Falta de A    Nuevo de B (20 chunks)  │
│                                                     │
│  Queue 2:  [A5, A7, A9, B1, B3, B5, ..., B39]      │
│            └─────┬─────┘ └──────────┬──────────┘   │
│              Falta de A    Nuevo de B (20 chunks)  │
└─────────────────────────────────────────────────────┘

⚠️ IMPORTANTE: Los chunks de File B se AGREGAN a las colas
   NO se espera a que File A termine
   Se procesan en orden FIFO
```

---

### POST #3-10: Múltiples archivos simultáneos

```
Tiempo: T=1-5s

POST #3:  20 chunks (File C)  → AGREGA a colas
POST #4:  10 chunks (File D)  → AGREGA a colas
POST #5:  30 chunks (File E)  → AGREGA a colas
POST #6:  15 chunks (File F)  → AGREGA a colas
POST #7:  50 chunks (File G)  → AGREGA a colas
POST #8:   5 chunks (File H)  → AGREGA a colas
POST #9:  25 chunks (File I)  → AGREGA a colas
POST #10: 45 chunks (File J)  → AGREGA a colas

┌─────────────────────────────────────────────────────┐
│  Queue 1: [A4, A6, A8, B0, B2, ..., J0, J2, ...]   │
│           │   │   │   │   │         │   │          │
│           └───┴───┴───┴───┴─ ─ ─ ─ ─┴───┴─ ─ ─    │
│              125 chunks acumulados                  │
│              Procesando 1 a la vez                  │
│                                                     │
│  Queue 2: [A5, A7, A9, B1, B3, ..., J1, J3, ...]   │
│           │   │   │   │   │         │   │          │
│           └───┴───┴───┴───┴─ ─ ─ ─ ─┴───┴─ ─ ─    │
│              125 chunks acumulados                  │
│              Procesando 1 a la vez                  │
└─────────────────────────────────────────────────────┘

Orden de procesamiento (Queue 1):
  A4 → A6 → A8 → B0 → B2 → ... → C0 → ... → J0 → J2 → ...
  │    │    │    │    │          │          │    │
  └────┴────┴────┴────┴──────────┴──────────┴────┴──── FIFO
```

---

### Vista en Tiempo Real (Logs)

```
[UploadPoolService] Upload Pool initialized with 2 wallet queue(s)
[UploadPoolService]   Queue 1: 0xA5D2fe025b74d02DB9c43EA36333B8754daF766d
[UploadPoolService]   Queue 2: 0xb4b277095Ef92243EF4B3A5d69F19794871d9954

[Queue 1] Background processor started (wallet: 0xA5D2...)
[Queue 2] Background processor started (wallet: 0xb4b2...)

// T=0s: POST #1
[UploadPoolService] Adding 10 chunks to pool for file A (2 wallet(s))
[UploadPoolService]   Queue 1: 5 chunk(s) pending
[UploadPoolService]   Queue 2: 5 chunk(s) pending

[Queue 1] Processing chunk 1/10 for file A
[Queue 2] Processing chunk 2/10 for file A
[Queue 1] Chunk 1/10 uploaded - Key: 0x123...
[Queue 2] Chunk 2/10 uploaded - Key: 0x456...

// T=1s: POST #2 (mientras Queue 1 y 2 siguen procesando A)
[UploadPoolService] Adding 40 chunks to pool for file B (2 wallet(s))
[UploadPoolService]   Queue 1: 23 chunk(s) pending  ← 3 de A + 20 de B
[UploadPoolService]   Queue 2: 23 chunk(s) pending  ← 3 de A + 20 de B

[Queue 1] Processing chunk 3/10 for file A  ← Continúa con A
[Queue 2] Processing chunk 4/10 for file A
...

// T=2s: POST #3-10
[UploadPoolService] Adding 20 chunks to pool for file C (2 wallet(s))
[UploadPoolService]   Queue 1: 50 chunk(s) pending
[UploadPoolService]   Queue 2: 50 chunk(s) pending

[UploadPoolService] Adding 10 chunks to pool for file D (2 wallet(s))
[UploadPoolService]   Queue 1: 55 chunk(s) pending
[UploadPoolService]   Queue 2: 55 chunk(s) pending

...

// Procesamiento continúa sin detenerse
[Queue 1] Processing chunk 1/40 for file B  ← Ahora procesa B
[Queue 2] Processing chunk 2/40 for file B
[Queue 1] Chunk 1/40 uploaded - Key: 0x789...
[Queue 2] Chunk 2/40 uploaded - Key: 0xabc...

// Después de procesar todos (T=250s)
[Queue 1] Success: 125, Failures: 0  ← No termina, sigue en loop
[Queue 2] Success: 125, Failures: 0  ← Esperando nuevos chunks
```

---

## 🔑 Puntos Clave

### ✅ Colas Persistentes

- Las colas **nunca se detienen** (loop infinito)
- Esperan nuevos chunks cuando están vacías (polling 500ms)
- No se reinician por cada POST

### ✅ Acumulación de Chunks

- Múltiples POST → chunks se **acumulan** en las mismas colas
- Procesamiento FIFO (First In, First Out)
- Sin crear nuevas instancias del pool

### ✅ Sin Errores de Nonce

- Cada wallet procesa **1 chunk a la vez** (secuencial)
- No hay transacciones paralelas por wallet
- Nonce siempre en orden correcto

### ✅ Throughput con Múltiples Wallets

- Más wallets = más chunks en paralelo (pero 1 por wallet)
- 2 wallets → 2 chunks simultáneos (1 por wallet)
- 5 wallets → 5 chunks simultáneos (1 por wallet)

---

## 🚫 Comportamiento INCORRECTO (Anterior)

### ❌ Sistema Anterior (Causaba errores de nonce)

```
POST #1 → uploadInBackground()
  ↓
  Promise.all([
    wallet1.upload(chunk0),  ← Paralelo
    wallet1.upload(chunk2),  ← Paralelo  } Error de nonce!
    wallet1.upload(chunk4),  ← Paralelo
    ...
  ])
```

### ✅ Sistema Actual (Sin errores)

```
POST #1 → addChunks() → Agrega a Queue 1
POST #2 → addChunks() → Agrega a Queue 1
...

Queue 1 (loop infinito):
  chunk0 → espera → chunk2 → espera → chunk4 → ...
  │         ▲       │         ▲       │
  └─────────┘       └─────────┘       └─── SECUENCIAL
```
