# API Resume - Arka CDN

Documentación completa de todos los endpoints de la API con ejemplos de request y response.

**Base URL:** `http://localhost:3000/api`  
**Swagger UI:** `http://localhost:3000/api-docs`

---

## 📋 Índice

- [Autenticación](#autenticación)
- [Subida de Archivos](#subida-de-archivos)
- [Gestión de Archivos](#gestión-de-archivos)
- [Acceso Público](#acceso-público)
- [Estadísticas](#estadísticas)
- [Health Check](#health-check)

---

## 🔐 Autenticación

Todos los endpoints excepto los de autenticación y `/data/:uuid` requieren un token JWT en el header:

```
Authorization: Bearer <tu_token_jwt>
```

### POST `/auth/register`

Registra un nuevo usuario en la plataforma.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}
```

**Response (201):**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**Errores:**

- **409 Conflict:** Email ya registrado

---

### POST `/auth/login`

Inicia sesión con email y contraseña, o con dirección de wallet.

**Request Body (Email/Password):**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Request Body (Wallet):**

```json
{
  "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
}
```

**Response (200):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

**Errores:**

- **401 Unauthorized:** Credenciales inválidas

---

### POST `/auth/refresh`

Refresca el access token usando el refresh token.

**Request Body:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200):**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errores:**

- **401 Unauthorized:** Refresh token inválido o expirado

---

### POST `/auth/logout`

Cierra la sesión actual (revoca el token).

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "message": "Session closed successfully"
}
```

---

### GET `/auth/me`

Obtiene la información del usuario autenticado.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

---

## 📤 Subida de Archivos

### POST `/upload/file`

Sube un archivo de cualquier tipo soportado a Arkiv Network.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data:**

- `file` (required): Archivo a subir
- `description` (optional): Descripción del archivo
- `compress` (optional, default: `true`): Comprimir archivo (solo imágenes/videos)
- `enableDashStreaming` (optional, default: `false`): Convertir a DASH streaming (solo videos, temporalmente deshabilitado)
- `ttl` (optional): Tiempo de vida en milisegundos (mínimo 60000ms)

**Tipos de archivo soportados:**

- **Imágenes:** jpeg, jpg, png, gif
- **Videos:** mp4, avi, mov, wmv, webm, mkv
- **Documentos:** pdf, zip, tar, gz
- **Texto:** txt, md, csv, log, xml, html, css, js, ts, jsx, tsx
- **Datos:** json, yaml, yml, toml, ini, conf, config

**Límites:**

- Sin streaming: 100MB
- Con streaming: 500MB

**Response (200):**

```json
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "fileId": "550e8400-e29b-41d4-a716-446655440000",
    "arkivAddresses": ["0xabc123...", "0xdef456..."],
    "totalSize": 1024000,
    "originalSize": 2048000,
    "compressed": true,
    "chunks": 2,
    "status": "completed",
    "publicUrl": "http://localhost:3000/api/data/550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Errores:**

- **400 Bad Request:** Archivo no válido o error de validación
- **401 Unauthorized:** Token inválido o ausente

---

### POST `/upload/plain`

Sube datos en texto plano o JSON sin usar form-data.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "data": {
    "key": "value",
    "config": {
      "theme": "dark"
    }
  },
  "filename": "config.json",
  "description": "Application configuration"
}
```

**O con texto plano:**

```json
{
  "data": "Hello World\nThis is plain text",
  "filename": "notes.txt",
  "description": "My notes"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Plain text upload started",
  "data": {
    "fileId": "550e8400-e29b-41d4-a716-446655440000",
    "originalName": "config.json",
    "size": 1024,
    "mimeType": "application/json",
    "status": "completed",
    "message": "Upload completed successfully",
    "publicUrl": "http://localhost:3000/api/data/550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Errores:**

- **400 Bad Request:** `data` y `filename` son requeridos

---

## 📁 Gestión de Archivos

### GET `/upload`

Lista todos los archivos del usuario autenticado.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "originalName": "image.jpg",
      "mimeType": "image/jpeg",
      "size": 1024000,
      "isDashVideo": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "expiresAt": null,
      "publicUrl": "http://localhost:3000/api/data/550e8400-e29b-41d4-a716-446655440000"
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "originalName": "config.json",
      "mimeType": "application/json",
      "size": 2048,
      "isDashVideo": false,
      "createdAt": "2024-01-02T00:00:00.000Z",
      "expiresAt": "2024-01-03T00:00:00.000Z",
      "publicUrl": "http://localhost:3000/api/data/660e8400-e29b-41d4-a716-446655440001"
    }
  ]
}
```

---

### GET `/upload/:id`

Obtiene información detallada de un archivo específico.

**Headers:**

```
Authorization: Bearer <token>
```

**Path Parameters:**

- `id`: ID del archivo (UUID)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "originalName": "image.jpg",
    "mimeType": "image/jpeg",
    "size": 1024000,
    "userId": "user-uuid",
    "isDashVideo": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "expiresAt": null,
    "chunks": [
      {
        "id": "chunk-uuid-1",
        "chunkIndex": 0,
        "arkivAddress": "0xabc123...",
        "size": 512000,
        "txHash": "0xtxhash1..."
      },
      {
        "id": "chunk-uuid-2",
        "chunkIndex": 1,
        "arkivAddress": "0xdef456...",
        "size": 512000,
        "txHash": "0xtxhash2..."
      }
    ],
    "publicUrl": "http://localhost:3000/api/data/550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Errores:**

- **404 Not Found:** Archivo no encontrado

---

### GET `/upload/:id/text`

Obtiene el contenido de un archivo de texto.

**Headers:**

```
Authorization: Bearer <token>
```

**Path Parameters:**

- `id`: ID del archivo (UUID)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "fileId": "550e8400-e29b-41d4-a716-446655440000",
    "originalName": "notes.txt",
    "mimeType": "text/plain",
    "size": 1024,
    "content": "Hello World\nThis is plain text",
    "encoding": "utf-8"
  }
}
```

**Errores:**

- **400 Bad Request:** El archivo no es de tipo texto
- **404 Not Found:** Archivo no encontrado

---

### GET `/upload/:id/json`

Obtiene y parsea automáticamente un archivo JSON.

**Headers:**

```
Authorization: Bearer <token>
```

**Path Parameters:**

- `id`: ID del archivo (UUID)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "fileId": "550e8400-e29b-41d4-a716-446655440000",
    "originalName": "config.json",
    "data": {
      "key": "value",
      "config": {
        "theme": "dark"
      }
    }
  }
}
```

**Errores:**

- **400 Bad Request:** El archivo no es JSON o no se puede parsear
- **404 Not Found:** Archivo no encontrado

---

### DELETE `/upload/:id`

Elimina un archivo específico.

**Headers:**

```
Authorization: Bearer <token>
```

**Path Parameters:**

- `id`: ID del archivo (UUID)

**Response (200):**

```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

**Errores:**

- **404 Not Found:** Archivo no encontrado

---

### GET `/upload/:id/status`

Obtiene el estado actual de subida de un archivo.

**Headers:**

```
Authorization: Bearer <token>
```

**Path Parameters:**

- `id`: ID del archivo (UUID)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "fileId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "progress": 100,
    "totalChunks": 2,
    "uploadedChunks": 2,
    "failedChunks": 0,
    "retryCount": 0,
    "lastError": null,
    "chunks": [
      {
        "chunkIndex": 0,
        "status": "completed",
        "arkivAddress": "0xabc123...",
        "txHash": "0xtxhash1..."
      },
      {
        "chunkIndex": 1,
        "status": "completed",
        "arkivAddress": "0xdef456...",
        "txHash": "0xtxhash2..."
      }
    ]
  }
}
```

**Estados posibles:**

- `pending`: Esperando procesamiento
- `processing`: En proceso de subida
- `completed`: Subida completada exitosamente
- `failed`: Subida fallida

---

## 🌐 Acceso Público

### GET `/data/:uuid`

**⚠️ ENDPOINT PÚBLICO - No requiere autenticación**

Descarga un archivo directamente usando su UUID. El archivo se retorna como datos binarios con el Content-Type apropiado.

**Path Parameters:**

- `uuid`: UUID del archivo

**Response (200):**

El archivo se retorna directamente como datos binarios con los siguientes headers:

```
Content-Type: <mime-type del archivo>
Content-Length: <tamaño en bytes>
Content-Disposition: inline; filename="<nombre original>"
Cache-Control: public, max-age=31536000, immutable
```

**Uso en HTML:**

```html
<!-- Imagen -->
<img src="http://localhost:3000/api/data/550e8400-e29b-41d4-a716-446655440000" alt="Image" />

<!-- Video -->
<video controls>
  <source
    src="http://localhost:3000/api/data/550e8400-e29b-41d4-a716-446655440000"
    type="video/mp4"
  />
</video>

<!-- Audio -->
<audio controls>
  <source
    src="http://localhost:3000/api/data/550e8400-e29b-41d4-a716-446655440000"
    type="audio/mpeg"
  />
</audio>

<!-- Link de descarga -->
<a href="http://localhost:3000/api/data/550e8400-e29b-41d4-a716-446655440000" download>
  Descargar archivo
</a>
```

**Uso en JavaScript:**

```javascript
// Descargar archivo
const response = await fetch('http://localhost:3000/api/data/550e8400-e29b-41d4-a716-446655440000');
const blob = await response.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'archivo.jpg';
a.click();

// Obtener como texto
const text = await response.text();

// Obtener como JSON
const json = await response.json();
```

**Errores:**

- **404 Not Found:** Archivo no encontrado o UUID inválido
- **500 Internal Server Error:** Error al recuperar el archivo de Arkiv Network

---

## 📊 Estadísticas

### GET `/upload/stats/wallet-pool`

Obtiene estadísticas del pool de subida y wallets.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "activeUploads": 3,
    "queuedUploads": 5,
    "completedUploads": 42,
    "failedUploads": 1,
    "wallets": {
      "total": 10,
      "available": 7,
      "inUse": 3
    },
    "performance": {
      "averageUploadTime": 2500,
      "successRate": 97.67
    }
  }
}
```

---

### POST `/upload/stats/wallet-pool/reset`

**Deprecated** - Este endpoint ya no es necesario.

**Response (200):**

```json
{
  "success": true,
  "message": "No action needed - wallet reset not required in new system"
}
```

---

## 🏥 Health Check

### GET `/`

Mensaje de bienvenida de la API.

**Response (200):**

```
Welcome to OpenLeague Backend - NestJS + Prisma + Hardhat
```

---

### GET `/health`

Verifica el estado del servidor.

**Response (200):**

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## 📝 Códigos de Estado HTTP

### Códigos de Éxito

- **200 OK:** Solicitud exitosa
- **201 Created:** Recurso creado exitosamente

### Códigos de Error

- **400 Bad Request:** Datos de entrada inválidos o error de validación
- **401 Unauthorized:** Token JWT inválido, ausente o expirado
- **404 Not Found:** Recurso no encontrado
- **409 Conflict:** Conflicto (ej: email ya registrado)
- **500 Internal Server Error:** Error del servidor

---

## 🔒 Autenticación JWT

### Estructura del Token

Los tokens JWT contienen:

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "iat": 1234567890,
  "exp": 1234571490
}
```

### Duración de Tokens

- **Access Token:** 1 hora
- **Refresh Token:** 7 días

### Flujo de Autenticación

1. **Login:** Obtener `accessToken` y `refreshToken`
2. **Usar API:** Incluir `accessToken` en header `Authorization: Bearer <token>`
3. **Token Expirado:** Usar `/auth/refresh` con `refreshToken` para obtener nuevo `accessToken`
4. **Logout:** Llamar `/auth/logout` para revocar tokens

---

## 📦 Ejemplos de Uso

### TypeScript/JavaScript

```typescript
// Login
const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePass123!',
  }),
});
const { accessToken } = await loginResponse.json();

// Subir archivo
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('description', 'Mi archivo');
formData.append('compress', 'true');

const uploadResponse = await fetch('http://localhost:3000/api/upload/file', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}` },
  body: formData,
});
const uploadResult = await uploadResponse.json();

// Usar URL pública
console.log('Archivo disponible en:', uploadResult.data.publicUrl);
```

### Python

```python
import requests

# Login
response = requests.post(
    'http://localhost:3000/api/auth/login',
    json={'email': 'user@example.com', 'password': 'SecurePass123!'}
)
token = response.json()['accessToken']

# Subir archivo
files = {'file': open('image.jpg', 'rb')}
data = {'description': 'Mi imagen', 'compress': 'true'}
headers = {'Authorization': f'Bearer {token}'}

response = requests.post(
    'http://localhost:3000/api/upload/file',
    files=files,
    data=data,
    headers=headers
)
print(response.json())
```

### cURL

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123!"}'

# Subir archivo
curl -X POST http://localhost:3000/api/upload/file \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/file.jpg" \
  -F "description=Mi archivo" \
  -F "compress=true"

# Listar archivos
curl -X GET http://localhost:3000/api/upload \
  -H "Authorization: Bearer <token>"
```

---

## 🚀 Notas Adicionales

### Compresión de Archivos

- **Imágenes:** Se comprimen automáticamente a resolución 1080p manteniendo la calidad
- **Videos:** Compresión opcional que reduce el tamaño sin perder calidad visible
- **Otros archivos:** No se comprimen

### TTL (Time To Live)

- Los archivos pueden configurarse con un tiempo de expiración
- Después de expirar, se eliminan automáticamente
- TTL mínimo: 60000ms (1 minuto)
- TTL recomendado para archivos temporales: 86400000ms (24 horas)

### DASH Streaming

**⚠️ Temporalmente deshabilitado**

La conversión automática a DASH streaming está temporalmente deshabilitada. Los videos se suben normalmente y pueden reproducirse directamente.

### Límites y Cuotas

- **Tamaño máximo por archivo:** 100MB (sin streaming)
- **Chunk size:** 1MB (archivos grandes se dividen automáticamente)
- **Archivos simultáneos:** Dependiente del pool de wallets disponibles

---

## 🐛 Manejo de Errores

Todos los endpoints retornan errores en el siguiente formato:

```json
{
  "statusCode": 400,
  "message": "Descripción del error",
  "error": "Bad Request"
}
```

### Errores Comunes

**401 Unauthorized:**

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

**400 Bad Request:**

```json
{
  "statusCode": 400,
  "message": "File too large",
  "error": "Bad Request"
}
```

**404 Not Found:**

```json
{
  "statusCode": 404,
  "message": "File not found",
  "error": "Not Found"
}
```

---

## 📚 Recursos Adicionales

- **Swagger UI:** `http://localhost:3000/api-docs` - Documentación interactiva
- **Repositorio:** [GitHub](https://github.com/Emanuel250YT/arka-cdn)
- **Arkiv Network:** [Documentación oficial](https://arkiv.network)

---

**Última actualización:** Noviembre 2025  
**Versión API:** 1.0
