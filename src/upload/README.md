# Upload Module - Documentación

## Configuración

### Variables de Entorno

Agrega las siguientes variables a tu archivo `.env`:

```env
# Arkiv Network - Private Key (sin el prefijo 0x)
ARKIV_PRIVATE_KEY=tu_private_key_en_hex
```

**Importante**:

- La private key debe estar en formato hexadecimal sin el prefijo `0x`
- Esta key se usa para firmar transacciones en Arkiv Network
- **NUNCA** compartas tu private key

### Dependencias de Sistema

Para comprimir videos, necesitas tener instalado **FFmpeg** en tu sistema:

- **Windows**: Descarga desde [ffmpeg.org](https://ffmpeg.org/download.html) y agrega al PATH
- **Linux**: `sudo apt-get install ffmpeg`
- **macOS**: `brew install ffmpeg`

## Tipos de Archivos Soportados

El sistema ahora soporta múltiples tipos de archivos:

### Imágenes

- Formatos: `jpeg`, `jpg`, `png`, `gif`
- Compresión automática disponible

### Videos

- Formatos: `mp4`, `avi`, `mov`, `wmv`, `webm`, `mkv`
- Compresión automática y streaming DASH disponible

### Archivos de Texto

- Formatos: `txt`, `md`, `csv`, `log`, `xml`, `html`, `css`, `js`, `ts`, `jsx`, `tsx`
- Se almacenan sin compresión

### Archivos de Datos

- Formatos: `json`, `yaml`, `yml`, `toml`, `ini`, `conf`, `config`
- Endpoints especiales para JSON parseado

### Documentos

- Formatos: `pdf`

### Archivos Comprimidos

- Formatos: `zip`, `tar`, `gz`

## Características de Compresión Automática

El sistema comprime automáticamente imágenes y videos antes de subirlos (opcional):

### Imágenes

- ✅ Redimensiona automáticamente a máximo **1920x1080** (1080p)
- ✅ Convierte a formato JPEG optimizado
- ✅ Compresión con calidad 80% usando mozjpeg
- ✅ Mantiene la relación de aspecto
- ✅ Reducción típica del 60-80% del tamaño original

### Videos

- ✅ Redimensiona automáticamente a máximo **1920x1080** (1080p)
- ✅ Codec H.264 con preset medium
- ✅ CRF 23 (balance calidad/tamaño)
- ✅ Audio AAC a 128kbps
- ✅ Optimización para streaming (faststart)
- ✅ Mantiene la relación de aspecto
- ✅ Reducción típica del 50-70% del tamaño original

### Archivos Planos (JSON, Texto, etc.)

- ✅ Se almacenan sin compresión para mantener compatibilidad
- ✅ Acceso directo al contenido como texto
- ✅ JSON se puede obtener parseado automáticamente

## Almacenamiento en Arkiv Network

Los archivos se almacenan en **Arkiv Network** con las siguientes características:

- **Chain ID**: 60138453025 (Arkiv Mendoza)
- **RPC URL**: https://mendoza.hoodi.arkiv.network/rpc
- **Expiración**: 12 horas (43200 segundos)
- **Metadata**: Se almacena como attributes en cada entity
  - `type`: 'file' o 'file-chunk'
  - `id`: UUID único
  - `fileName`: Nombre original del archivo
  - `mimeType`: Tipo MIME
  - `userId`: ID del usuario propietario
  - `size`: Tamaño en bytes
  - `uploadedAt`: Timestamp de creación
  - `chunkIndex`: Índice del chunk (solo para chunks)

## Endpoints

### 1. Subir Archivo

**POST** `/upload`

Sube cualquier tipo de archivo soportado y lo guarda en Arkiv Network.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Body (form-data):**

- `file`: Archivo (imagen, video, JSON, texto, etc.) - **Requerido**
- `description`: Descripción del archivo - Opcional
- `compress`: Comprimir archivo (solo imágenes/videos) - Opcional, default: `true`
- `enableDashStreaming`: Convertir a DASH streaming (solo videos) - Opcional, default: `false`

**Límites:**

- Tamaño máximo: 100MB (sin streaming) / 500MB (con streaming)
- Chunk size: 1MB (si el archivo es mayor, se divide automáticamente)

**Respuesta exitosa:**

```json
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "fileId": "uuid",
    "arkivAddresses": ["entityKey1", "entityKey2"],
    "totalSize": 1500000,
    "originalSize": 5000000,
    "compressed": true,
    "chunks": 2
  }
}
```

**Ejemplo - Subir JSON:**

```bash
curl -X POST http://localhost:3000/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@config.json" \
  -F "description=Configuration file"
```

**Ejemplo - Subir Texto:**

```bash
curl -X POST http://localhost:3000/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@README.md"
```

**Ejemplo - Subir Imagen con JavaScript:**

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('compress', 'true');

const response = await fetch('http://localhost:3000/upload', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
});

const result = await response.json();
console.log('Archivo subido:', result.data);
```

### 2. Listar Archivos del Usuario

**GET** `/upload`

Obtiene todos los archivos subidos por el usuario autenticado.

**Headers:**

```
Authorization: Bearer <token>
```

**Respuesta:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "originalName": "config.json",
      "mimeType": "video/mp4",
      "size": 5242880,
      "encoding": "buffer",
      "arkivAddress": null,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "chunks": [
        {
          "chunkIndex": 0,
          "arkivAddress": "0x...",
          "size": 1048576
        }
      ]
    }
  ]
}
```

### 3. Obtener Archivo Específico

**GET** `/upload/:id`

Obtiene la información de un archivo específico.

**Headers:**

```
Authorization: Bearer <token>
```

**Respuesta:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "originalName": "config.json",
    "mimeType": "application/json",
    "size": 524288,
    "encoding": "base64",
    "arkivAddress": "entityKey",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "chunks": []
  }
}
```

### 4. Obtener Archivo como Texto

**GET** `/upload/:id/text`

Obtiene el contenido de archivos de texto, JSON, XML, etc. como string UTF-8.

**Soporta:**

- Archivos de texto (.txt, .md, .csv, .log, etc.)
- JSON (.json)
- XML (.xml)
- Código fuente (.js, .ts, .html, .css, etc.)
- YAML (.yaml, .yml)

**Headers:**

```
Authorization: Bearer <token>
```

**Respuesta:**

```json
{
  "success": true,
  "data": {
    "fileId": "uuid",
    "originalName": "config.json",
    "mimeType": "application/json",
    "size": 1234,
    "content": "{\"key\": \"value\"}",
    "encoding": "utf-8"
  }
}
```

**Ejemplo:**

```bash
curl -X GET http://localhost:3000/upload/file-id/text \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 5. Obtener Archivo JSON Parseado

**GET** `/upload/:id/json`

Obtiene y parsea automáticamente archivos JSON.

**Headers:**

```
Authorization: Bearer <token>
```

**Respuesta:**

```json
{
  "success": true,
  "data": {
    "fileId": "uuid",
    "originalName": "config.json",
    "data": {
      "key": "value",
      "nested": {
        "property": 123
      }
    }
  }
}
```

**Ejemplo con JavaScript:**

```javascript
const response = await fetch('http://localhost:3000/upload/file-id/json', {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

const { data } = await response.json();
console.log('JSON parseado:', data.data);
```

### 6. Eliminar Archivo

**DELETE** `/upload/:id`

Elimina un archivo y todos sus chunks asociados de la base de datos.

**Nota**: Los datos en Arkiv Network expiran automáticamente después de 30 días.

**Headers:**

```
Authorization: Bearer <token>
```

**Respuesta:**

```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

## Cómo Funciona

### Proceso de Upload

1. **Recepción del archivo**: El servidor recibe el archivo via `multipart/form-data`
2. **Validación**: Verifica tipo y tamaño del archivo
3. **Detección de tipo**: Identifica si es imagen, video o archivo plano
4. **Compresión opcional**:
   - **Imágenes**: Redimensiona a máximo 1080p y comprime a JPEG con calidad 80%
   - **Videos**: Redimensiona a máximo 1080p, recodifica con H.264 y optimiza audio
   - **Archivos planos**: No se comprimen, se almacenan tal cual
5. **Chunking** (si es necesario):
   - Si el archivo es > 1MB, se divide en chunks de 1MB
   - Cada chunk se sube por separado
6. **Storage en Arkiv**:
   - Usa `createWalletClient` y `createEntity` del SDK de Arkiv
   - Crea entities con attributes para metadata
   - Cada entity tiene una expiración de 12 horas
7. **Guardado en BD**: Guarda referencias en PostgreSQL con:
   - Información del archivo (nombre, tipo, tamaño comprimido)
   - EntityKey de Arkiv (si es archivo pequeño)
   - Lista de chunks con sus EntityKeys (si es archivo grande)
   - ID del usuario que lo subió

### Modelos de Base de Datos

**File:**

- `id`: UUID del archivo
- `originalName`: Nombre original del archivo
- `mimeType`: Tipo MIME (image/jpeg, video/mp4, etc.)
- `size`: Tamaño en bytes (después de compresión)
- `encoding`: Tipo de encoding ('buffer')
- `arkivAddress`: EntityKey en Arkiv (para archivos pequeños)
- `userId`: ID del usuario propietario
- `chunks`: Relación con FileChunk[]

**FileChunk:**

- `id`: UUID del chunk
- `chunkIndex`: Índice del chunk (0, 1, 2, ...)
- `arkivAddress`: EntityKey en Arkiv de este chunk
- `size`: Tamaño del chunk en bytes
- `fileId`: ID del archivo padre

## Endpoints Públicos

### GET /data/:uuid

**Endpoint público** para recuperar archivos por su UUID sin necesidad de autenticación.

**Características:**

- ✅ No requiere autenticación
- ✅ Rearma automáticamente el archivo desde sus chunks en Arkiv
- ✅ Retorna el archivo completo en base64
- ✅ Incluye metadata del archivo (nombre, tipo MIME, tamaño)
- ✅ Verifica que todos los chunks estén completamente subidos
- ✅ Cache público inmutable para máxima performance

**Ejemplo de uso:**

```bash
# Obtener un archivo por su UUID
curl http://localhost:3000/data/550e8400-e29b-41d4-a716-446655440000

# Respuesta:
{
  "success": true,
  "data": {
    "fileId": "550e8400-e29b-41d4-a716-446655440000",
    "originalName": "example.jpg",
    "mimeType": "image/jpeg",
    "size": 1024000,
    "fileData": "base64_encoded_file_data..."
  }
}
```

**Casos de uso:**

- Compartir archivos públicamente mediante link directo
- Embedear imágenes en HTML: `<img src="data:image/jpeg;base64,{fileData}" />`
- CDN público para servir assets
- Integración con aplicaciones frontend

**Errores posibles:**

- `404`: Archivo no encontrado
- `500`: Error al recuperar chunks desde Arkiv
- `500`: El archivo no está completamente subido

## Seguridad

- Los endpoints de `/upload` requieren autenticación JWT
- El endpoint `/data/:uuid` es **público** y no requiere autenticación
- Los usuarios solo pueden subir/editar/eliminar sus propios archivos
- Los archivos son accesibles públicamente si se conoce el UUID
- Validación de tipo y tamaño de archivo
- Límite de 100MB por archivo (antes de compresión)
- Private key almacenada de forma segura en variables de entorno
- Los datos en Arkiv expiran automáticamente después de 12 horas

## Notas Importantes

### Performance

- Los chunks se procesan secuencialmente para evitar sobrecarga
- El tamaño de chunk (1MB) puede ajustarse en `CHUNK_SIZE` del servicio
- La compresión de videos puede tardar varios segundos dependiendo del tamaño original
- La compresión de imágenes es muy rápida (milisegundos)

### Configuración

- **Imágenes**: Ajusta `MAX_IMAGE_WIDTH`, `MAX_IMAGE_HEIGHT` e `IMAGE_QUALITY` en el servicio
- **Videos**: Ajusta `VIDEO_RESOLUTION` y los parámetros de ffmpeg en `compressVideo()`
- **Expiración**: Ajusta `EXPIRES_IN` (en segundos) para cambiar el tiempo de expiración en Arkiv
- Asegúrate de tener FFmpeg instalado en el sistema para comprimir videos

### Arkiv Network

- Los archivos se almacenan en Arkiv Mendoza network
- Cada archivo/chunk es un entity con attributes
- Los entities expiran automáticamente después de 12 horas
- El EntityKey es una dirección hexadecimal única
- La metadata se almacena como attributes en cada entity

### Limitaciones

- Videos muy grandes (>100MB) pueden exceder el límite antes de compresión
- La compresión reduce el tamaño pero también puede afectar ligeramente la calidad
- FFmpeg debe estar instalado y accesible en el PATH del sistema
- Los datos en Arkiv expiran después de 12 horas (configurable)
