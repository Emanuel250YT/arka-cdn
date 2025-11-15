# Public File Retrieval Endpoint

## Overview

The `/data/:uuid` endpoint provides **public access** to files stored on the Arkiv CDN without requiring authentication. This endpoint automatically retrieves all file chunks from the Arkiv blockchain, reassembles them, and returns the complete file.

## Endpoint Details

### GET /data/:uuid

**Public endpoint** - No authentication required

**Parameters:**

- `uuid` (path parameter): The unique identifier of the file

**Response:**

```json
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

## Features

✅ **No Authentication Required** - Anyone with the UUID can access the file
✅ **Automatic Chunk Reassembly** - Retrieves all chunks from Arkiv blockchain
✅ **Complete File Data** - Returns the full file in base64 format
✅ **Metadata Included** - Provides file name, MIME type, and size
✅ **Error Handling** - Validates that all chunks are uploaded before serving
✅ **Immutable Cache** - Sets cache headers for maximum CDN performance
✅ **Swagger Documentation** - Fully documented in the API docs

## How It Works

1. Client requests file by UUID: `GET /data/{uuid}`
2. Server queries database for file metadata and chunk information
3. Server validates that all chunks are fully uploaded
4. Server retrieves each chunk from Arkiv blockchain sequentially
5. Server reassembles chunks in correct order
6. Server returns complete file with metadata

```
Client → API → Database → Arkiv Network → API → Client
                  ↓
            Chunk Info
                  ↓
         [Chunk 0, Chunk 1, Chunk 2, ...]
                  ↓
          Reassemble Buffer
                  ↓
         Base64 Encode → Response
```

## Use Cases

### 1. Direct File Sharing

Share files by simply sharing the URL:

```
https://your-cdn.com/data/550e8400-e29b-41d4-a716-446655440000
```

### 2. Embed Images in HTML

```html
<img src="data:image/jpeg;base64,{fileData}" alt="Image from Arkiv" />
```

### 3. CDN for Frontend Assets

```javascript
// Fetch and use in your application
const response = await fetch(`https://your-cdn.com/data/${fileUuid}`);
const { fileData, mimeType } = (await response.json()).data;

// Create blob URL
const blob = base64ToBlob(fileData, mimeType);
const url = URL.createObjectURL(blob);

// Use in your app
document.querySelector('img').src = url;
```

### 4. Public File Hosting

Perfect for:

- 📸 Image galleries
- 📄 Document sharing
- 🎵 Audio files
- 🎬 Video hosting
- 📦 Asset distribution

## Security Considerations

⚠️ **Important Security Notes:**

1. **Public Access**: Files are accessible to anyone with the UUID
2. **No User Validation**: The endpoint does not check file ownership
3. **UUID Sharing**: Treat UUIDs as sensitive - only share with intended recipients
4. **No Deletion**: Files cannot be deleted via this endpoint
5. **Read-Only**: This endpoint only retrieves data, cannot modify

**Recommendations:**

- Share UUIDs only through secure channels
- Consider implementing rate limiting for production
- Monitor access patterns for suspicious activity
- Implement URL signing for sensitive files (future enhancement)

## Error Responses

### File Not Found (404)

```json
{
  "success": false,
  "message": "File not found"
}
```

### File Not Fully Uploaded (500)

```json
{
  "success": false,
  "message": "File is not fully uploaded. Chunk 2 is pending"
}
```

### Chunk Retrieval Error (500)

```json
{
  "success": false,
  "message": "Failed to retrieve file data: Chunk 3 not found in Arkiv"
}
```

## Performance

**Typical Response Times:**

| File Size | Chunks | Response Time |
| --------- | ------ | ------------- |
| 100 KB    | 2      | ~500ms        |
| 1 MB      | 16     | ~2s           |
| 10 MB     | 160    | ~15s          |
| 50 MB     | 800    | ~60s          |

**Optimization Tips:**

1. **Caching**: The endpoint sets `Cache-Control: public, max-age=31536000, immutable`
   - Use a CDN in front of your API to cache responses
   - Files are immutable (UUID never changes for same content)

2. **Compression**: Enable gzip/brotli compression on your reverse proxy
   - Base64 response compresses well (~30% reduction)

3. **Parallel Retrieval**: For very large files, consider streaming response
   - Current implementation loads entire file in memory

## Code Examples

### TypeScript/Node.js

```typescript
import axios from 'axios';
import { writeFileSync } from 'fs';

async function downloadFile(uuid: string) {
  const { data } = await axios.get(`http://localhost:3000/data/${uuid}`);

  const fileBuffer = Buffer.from(data.data.fileData, 'base64');
  writeFileSync(data.data.originalName, fileBuffer);

  console.log(`Downloaded: ${data.data.originalName} (${data.data.size} bytes)`);
}
```

### JavaScript/Browser

```javascript
async function embedImage(uuid) {
  const response = await fetch(`http://localhost:3000/data/${uuid}`);
  const { data } = await response.json();

  const img = document.createElement('img');
  img.src = `data:${data.mimeType};base64,${data.fileData}`;
  document.body.appendChild(img);
}
```

### Python

```python
import requests
import base64

def download_file(uuid: str):
    response = requests.get(f'http://localhost:3000/data/{uuid}')
    data = response.json()['data']

    file_data = base64.b64decode(data['fileData'])

    with open(data['originalName'], 'wb') as f:
        f.write(file_data)

    print(f"Downloaded: {data['originalName']} ({data['size']} bytes)")
```

### cURL

```bash
# Download and decode file
curl http://localhost:3000/data/{UUID} | \
  jq -r '.data.fileData' | \
  base64 -d > output.jpg
```

## Testing

Run the example script to test the endpoint:

```bash
# First, upload a file and get its UUID
# Then test retrieval:
npx ts-node examples/retrieve-file-public.ts <FILE_UUID>
```

The script will:

1. Retrieve the file from the API
2. Save it to `downloads/` directory
3. Create an HTML embed if it's an image
4. Display the public URL for sharing

## API Documentation

View the complete Swagger documentation at:

```
http://localhost:3000/api/docs
```

Navigate to the **Data** section to see the `/data/:uuid` endpoint with interactive testing.

## Implementation Details

### Controller Location

`src/upload/upload.controller.ts` - `DataController` class

### Service Method

`src/upload/upload.service.ts` - `getFileByUuid()` method

### Database Schema

Uses `File` and `FileChunk` models from Prisma schema

### Blockchain Integration

Retrieves chunks from Arkiv Network using the public client

## Future Enhancements

Potential improvements for the endpoint:

- [ ] **Streaming Response**: Stream file chunks instead of loading all in memory
- [ ] **Range Requests**: Support partial content (HTTP 206)
- [ ] **URL Signing**: Add optional signed URLs with expiration
- [ ] **Rate Limiting**: Implement per-IP rate limits
- [ ] **Analytics**: Track file access patterns
- [ ] **CDN Integration**: Direct integration with Cloudflare/AWS CloudFront
- [ ] **Compression**: On-the-fly compression for text files
- [ ] **Thumbnails**: Auto-generate thumbnails for images/videos

## Support

For issues or questions:

- Check the [Upload Module README](../src/upload/README.md)
- Review the [API Documentation](../API_DOCUMENTATION.md)
- See examples in [`examples/retrieve-file-public.ts`](../examples/retrieve-file-public.ts)
