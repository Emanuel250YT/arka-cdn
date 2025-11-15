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

## Características de Compresión Automática

El sistema comprime automáticamente todos los archivos antes de subirlos:

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

Sube una imagen o video, lo comprime automáticamente, y lo guarda en Arkiv Network.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Body (form-data):**

- `file`: Archivo (imagen o video) - **Requerido**
- `description`: Descripción del archivo - Opcional

**Límites:**

- Tamaño máximo: 100MB (antes de compresión)
- Tipos permitidos: jpeg, jpg, png, gif, mp4, avi, mov, wmv, webm
- Chunk size: 1MB (si el archivo es mayor, se divide automáticamente)

**Respuesta exitosa:**

```json
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "fileId": "uuid",
    "arkivAddress": "0x...", // EntityKey de Arkiv (si el archivo es pequeño)
    "chunks": [
      // Solo si el archivo fue chunkeado
      {
        "index": 0,
        "address": "0x...", // EntityKey del chunk
        "size": 1048576
      }
    ],
    "totalSize": 1500000, // Tamaño después de compresión
    "originalSize": 5000000, // Tamaño original del archivo
    "compressed": true // Indica si el archivo fue comprimido
  }
}
```

**Ejemplo con cURL:**

```bash
curl -X POST http://localhost:3000/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/image.jpg"
```

**Ejemplo con JavaScript/Fetch:**

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('http://localhost:3000/upload', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
});

const result = await response.json();
console.log('Archivo subido:', result.data);
console.log('Entity Key:', result.data.arkivAddress);
console.log(
  'Compresión:',
  Math.round((1 - result.data.totalSize / result.data.originalSize) * 100) + '%',
);
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
      "originalName": "video.mp4",
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
    "originalName": "image.jpg",
    "mimeType": "image/jpeg",
    "size": 524288,
    "encoding": "buffer",
    "arkivAddress": "0x...",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "chunks": []
  }
}
```

### 4. Eliminar Archivo

**DELETE** `/upload/:id`

Elimina un archivo y todos sus chunks asociados de la base de datos.

**Nota**: Los datos en Arkiv Network expiran automáticamente después de 12 horas.

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
3. **Compresión automática**:
   - **Imágenes**: Redimensiona a máximo 1080p y comprime a JPEG con calidad 80%
   - **Videos**: Redimensiona a máximo 1080p, recodifica con H.264 y optimiza audio
4. **Chunking** (si es necesario):
   - Si el archivo es > 1MB, se divide en chunks de 1MB
   - Cada chunk se sube por separado
5. **Storage en Arkiv**:
   - Usa `createWalletClient` y `createEntity` del SDK de Arkiv
   - Crea entities con attributes para metadata
   - Cada entity tiene una expiración de 12 horas
6. **Guardado en BD**: Guarda referencias en PostgreSQL con:
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

## Seguridad

- Todos los endpoints requieren autenticación JWT
- Los usuarios solo pueden acceder a sus propios archivos
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
