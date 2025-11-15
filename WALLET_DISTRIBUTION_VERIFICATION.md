# Verificación de Distribución de Wallets

## ✅ Sistema Implementado

### 1. Gestión de Wallets via JSON

- **Archivo**: `wallets.json`
- **Generación**: `node scripts/generate-wallets.js <cantidad>`
- **Carga**: Automática al iniciar el servicio
- **Fallback**: Variables de entorno si `wallets.json` no existe

### 2. Distribución Round-Robin

#### Método `getNextWallet()`

```typescript
private getNextWallet(): any {
  const wallet = this.walletClients[this.currentWalletIndex];
  this.currentWalletIndex = (this.currentWalletIndex + 1) % this.walletClients.length;
  return wallet;
}
```

**Funcionamiento**:

- Cada llamada devuelve la siguiente wallet en orden
- El índice se incrementa y reinicia automáticamente
- Garantiza distribución equitativa entre todas las wallets

### 3. Aplicación en Upload

#### En `uploadInBackground()`

```typescript
const uploadPromises = chunks.map((chunk, index) => {
  const wallet = this.getNextWallet(); // ← Obtiene la siguiente wallet
  this.logger.debug(
    `Chunk ${index + 1}/${totalChunks} assigned to wallet: ${wallet.account.address}`,
  );
  return this.uploadChunkToArkiv(chunk, metadata, wallet); // ← Usa esa wallet específica
});
```

#### En `uploadChunkToArkiv()`

```typescript
const result = await walletClient.createEntity({
  // ← Usa el walletClient pasado como parámetro, NO this.arkivClient
  payload: jsonToPayload({...}),
  // ...
});
```

## 🔍 Verificación

### Paso 1: Verificar Wallets Cargadas

```bash
# Debe mostrar las 5 wallets generadas
GET http://localhost:3000/upload/stats/wallet-pool

Respuesta esperada:
{
  "success": true,
  "data": {
    "totalWallets": 5,
    "currentWalletIndex": 0,
    "nextWalletAddress": "0xA5D2fe025b74d02DB9c43EA36333B8754daF766d",
    "loadBalancing": "round-robin",
    "wallets": [
      {
        "index": 1,
        "address": "0xA5D2fe025b74d02DB9c43EA36333B8754daF766d",
        "isNext": true
      },
      {
        "index": 2,
        "address": "0xb4b277095Ef92243EF4B3A5d69F19794871d9954",
        "isNext": false
      },
      // ... resto de wallets
    ]
  }
}
```

### Paso 2: Verificar Distribución en Logs

Al subir un archivo, los logs deben mostrar:

```
[UploadService] Starting background upload of 10 chunks for file abc-123
[UploadService] Load balancing: 5 wallet(s) using round-robin distribution
[UploadService] Chunk 1/10 assigned to wallet: 0xA5D2fe025b74d02DB9c43EA36333B8754daF766d
[UploadService] Chunk 2/10 assigned to wallet: 0xb4b277095Ef92243EF4B3A5d69F19794871d9954
[UploadService] Chunk 3/10 assigned to wallet: 0xd38Ad1cBbEE2658F9734D198429e98A2c4e7da87
[UploadService] Chunk 4/10 assigned to wallet: 0x79Fd6B9855637ba15f71581212C349B81E41A22F
[UploadService] Chunk 5/10 assigned to wallet: 0x3339C2f5881ca3584C7C47f882D17afA1073712c
[UploadService] Chunk 6/10 assigned to wallet: 0xA5D2fe025b74d02DB9c43EA36333B8754daF766d
[UploadService] Chunk 7/10 assigned to wallet: 0xb4b277095Ef92243EF4B3A5d69F19794871d9954
...
```

### Paso 3: Verificar en Blockchain

Cada chunk debe tener una transacción desde una wallet diferente. Con 5 wallets:

- Chunks 0, 5, 10, 15... → Wallet 1
- Chunks 1, 6, 11, 16... → Wallet 2
- Chunks 2, 7, 12, 17... → Wallet 3
- Chunks 3, 8, 13, 18... → Wallet 4
- Chunks 4, 9, 14, 19... → Wallet 5

## 📊 Ejemplo de Distribución

**Archivo con 60 chunks, 5 wallets:**

- Cada wallet procesa: 60 ÷ 5 = 12 chunks
- Wallet 1: chunks [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
- Wallet 2: chunks [1, 6, 11, 16, 21, 26, 31, 36, 41, 46, 51, 56]
- Wallet 3: chunks [2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57]
- Wallet 4: chunks [3, 8, 13, 18, 23, 28, 33, 38, 43, 48, 53, 58]
- Wallet 5: chunks [4, 9, 14, 19, 24, 29, 34, 39, 44, 49, 54, 59]

## ⚠️ Importante

1. **NO se usa `this.arkivClient`** directamente en `uploadChunkToArkiv()`
2. **Cada chunk usa la wallet asignada** por `getNextWallet()`
3. **La distribución es automática** y equitativa
4. **Los reintentos usan la misma wallet** del intento original

## 🔧 Configuración Actual

- **5 wallets generadas** en `wallets.json`
- **Round-robin habilitado** por defecto
- **Logging detallado** para auditoría
- **Fallback a .env** si es necesario

## 📝 Notas de Seguridad

- `wallets.json` está en `.gitignore`
- Cada wallet debe tener fondos suficientes para gas
- Recomendado: 0.1 ETH por wallet
- Monitorear saldo de wallets regularmente
