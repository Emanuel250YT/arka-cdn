# Arka CDN - Decentralized Storage with DASH Streaming

NestJS backend with decentralized storage on Arkiv Network, video conversion to DASH format, and intelligent file compression.

## 🚀 Main Features

- ✅ **Decentralized Storage**: Integration with Arkiv Network
- ✅ **DASH Streaming**: Automatic video conversion to adaptive format
- ✅ **Intelligent Compression**: Automatic optimization for images and videos
- ✅ **Plain Files**: Support for JSON, text, YAML, XML and more
- ✅ **Multiple Resolutions**: 1080p, 720p, 480p, 360p for videos
- ✅ **Automatic Chunking**: Large file splitting into 1MB chunks
- ✅ **Swagger UI**: Complete interactive documentation
- ✅ **Prisma ORM**: PostgreSQL database
- ✅ **JWT Authentication**: Robust security system
- ✅ **TypeScript**: Fully typed code
- ✅ **Complete Validation**: DTOs with class-validator
- ✅ **Multi-Wallet System**: Parallel transaction processing for maximum throughput

## ⚡ Performance Optimization

### Multi-Wallet System (WalletPool)

The CDN uses a **multi-wallet system** to parallelize blockchain transactions and dramatically increase upload speeds:

- **Single Wallet**: ~1 transaction/second → 60 seconds for 60 chunks
- **3 Wallets**: ~3 transactions/second → 20 seconds for 60 chunks (3x faster ⚡)
- **5 Wallets**: ~5 transactions/second → 12 seconds for 60 chunks (5x faster ⚡⚡⚡)

#### Quick Setup

Add multiple private keys to your `.env`:

```env
# Primary wallet (required)
ARKIV_PRIVATE_KEY=your_primary_key

# Additional wallets (optional, for better performance)
ARKIV_PRIVATE_KEY_2=your_second_key
ARKIV_PRIVATE_KEY_3=your_third_key
```

**Benefits:**

- 🚀 Automatic load balancing across wallets
- 📊 Real-time statistics via API
- 🔄 Nonce management per wallet
- 💪 Fault tolerance

**Learn more:**

- [Multi-Wallet System Documentation](./src/upload/WALLET_POOL.md)
- [Setup Guide & Examples](./src/upload/MULTI_WALLET_EXAMPLE.md)
- [Nonce Manager Details](./src/upload/NONCE_MANAGER.md)

## 📁 Supported File Types

- **Images**: JPEG, PNG, GIF (with optional compression)
- **Videos**: MP4, AVI, MOV, WebM, MKV (with compression and DASH streaming)
- **Text**: TXT, MD, CSV, LOG, XML, HTML, CSS, JS, TS
- **Data**: JSON, YAML, TOML, INI, CONFIG
- **Documents**: PDF
- **Archives**: ZIP, TAR, GZ

## 📋 Prerequisites

- **Node.js** (v18 or higher)
- **PostgreSQL** (v13 or higher)
- **FFmpeg** (for video conversion)
- npm or yarn

### Install FFmpeg

```bash
# Windows (chocolatey)
choco install ffmpeg

# macOS
brew install ffmpeg

# Linux
sudo apt-get install ffmpeg
```

## 🛠️ Installation

1. **Clone the repository**

```bash
git clone https://github.com/Emanuel250YT/arka-cdn.git
cd arka-cdn
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

```bash
cp .env.example .env
```

Edit the `.env` file:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/arka_cdn

# Arkiv Network
ARKIV_PRIVATE_KEY=your_private_key_without_0x

# JWT
JWT_SECRET=your_secret_key
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Email (optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_password

# Server
PORT=3000
```

4. **Configure Prisma**

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy
```

5. **Verify FFmpeg**

```bash
ffmpeg -version
```

## 🏃‍♂️ Running the Application

### Development

```bash
npm run start:dev
```

The server will be available at:

- **API**: `http://localhost:3000/api`
- **Swagger UI**: `http://localhost:3000/api/docs`

### Production

```bash
npm run build
npm run start:prod
```

## 📚 Documentation

### Swagger UI

Access the interactive documentation at:

```
http://localhost:3000/api/docs
```

### Additional Documentation

- **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)**: Complete endpoint guide
- **[DASH_STREAMING.md](./DASH_STREAMING.md)**: Streaming technical guide
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)**: Implementation summary
- **[examples/api-usage.ts](./examples/api-usage.ts)**: Example code

## 🎬 Quick Start

### 1. Upload Image with Compression

```bash
curl -X POST http://localhost:3000/api/upload/file \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@image.jpg" \
  -F "compress=true"
```

### 2. Upload Video without Modification

```bash
curl -X POST http://localhost:3000/api/upload/file \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@video.mp4" \
  -F "compress=false" \
  -F "enableDashStreaming=false"
```

### 3. **Retrieve File Publicly (No Auth Required) 🆕**

```bash
# Get file directly (returns the actual file, not JSON)
curl http://localhost:3000/data/{FILE_UUID} -o downloaded-file.jpg

# Or use in HTML directly:
# <img src="http://localhost:3000/data/{FILE_UUID}" />
```

**The endpoint now returns the file directly with the correct Content-Type**, so you can:

- Use it directly in `<img>`, `<video>`, `<audio>` tags
- Download files with proper mime types
- Embed in your website without processing

**Use cases:**

- 🔗 Share files with public links
- 🎨 Direct image embedding: `<img src="https://cdn.com/data/uuid" />`
- 📦 CDN for frontend assets
- 🌐 Public file hosting

**Example with HTML:**

```html
<!-- Image -->
<img src="http://localhost:3000/data/550e8400-e29b-41d4-a716-446655440000" />

<!-- Video -->
<video controls>
  <source src="http://localhost:3000/data/your-video-uuid" type="video/mp4" />
</video>

<!-- Download link -->
<a href="http://localhost:3000/data/your-file-uuid" download>Download File</a>
```

**Example with TypeScript:**

```typescript
import axios from 'axios';

// Download file (binary data)
const response = await axios.get(`http://localhost:3000/data/${fileUuid}`, {
  responseType: 'arraybuffer',
});

// Save to disk
const fileBuffer = Buffer.from(response.data);
fs.writeFileSync('downloaded-file.jpg', fileBuffer);

// Get metadata from headers
const contentType = response.headers['content-type'];
const filename = response.headers['content-disposition'];
```

- 🌐 Public file hosting

// Get metadata from headers
const contentType = response.headers['content-type'];
const filename = response.headers['content-disposition'];

````

See complete example in [`examples/retrieve-file-public.ts`](./examples/retrieve-file-public.ts)

### 4. Upload Plain Text Data as JSON

```bash
curl -X POST http://localhost:3000/api/upload/plain \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {"key": "value", "config": {"theme": "dark"}},
    "filename": "config.json",
    "description": "Configuration file"
  }'
````

### 5. Upload File (Form Data)

```bash
curl -X POST http://localhost:3000/api/upload/file \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@config.json" \
  -F "description=Configuration file"
```

### 6. Get Parsed JSON File

```bash
curl -X GET http://localhost:3000/api/upload/{fileId}/json \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:

```json
{
  "success": true,
  "data": {
    "fileId": "uuid",
    "originalName": "config.json",
    "data": {
      "key": "value",
      "nested": { "prop": 123 }
    }
  }
}
```

### 7. Get Text File Content

```bash
curl -X GET http://localhost:3000/api/upload/{fileId}/text \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:

```json
{
  "success": true,
  "data": {
    "fileId": "uuid",
    "originalName": "README.md",
    "mimeType": "text/markdown",
    "content": "# My text file content...",
    "encoding": "utf-8"
  }
}
```

### 8. Convert Video to DASH Streaming

```bash
curl -X POST http://localhost:3000/api/upload/video/dash \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@video.mp4" \
  -F 'resolutions=["1080p","720p","480p"]'
```

### 9. Play DASH Video

```html
<script src="https://cdn.dashjs.org/latest/dash.all.min.js"></script>
<video id="player" controls></video>

<script>
  const url = 'http://localhost:3000/api/upload/video/{videoId}/manifest';
  const player = dashjs.MediaPlayer().create();
  player.initialize(document.querySelector('#player'), url, true);
</script>
```

### JavaScript Examples

```javascript
// Upload JSON data as plain text
async function uploadPlainJSON(data, filename = 'data.json') {
  const response = await fetch('http://localhost:3000/api/upload/plain', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: data,
      filename: filename,
      description: 'Uploaded via API',
    }),
  });

  return response.json();
}

// Upload file using form data
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('description', 'My file');
  formData.append('compress', 'true');

  const response = await fetch('http://localhost:3000/api/upload/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  return response.json();
}

// Get and parse JSON
async function getJSON(fileId) {
  const response = await fetch(`http://localhost:3000/api/upload/${fileId}/json`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const { data } = await response.json();
  return data.data; // Parsed JSON content
}

// Usage
const myData = { config: { theme: 'dark', version: '1.0' } };

// Option 1: Upload as plain JSON
const uploaded1 = await uploadPlainJSON(myData, 'config.json');
console.log('File ID:', uploaded1.data.fileId);

// Option 2: Upload file using form data
const blob = new Blob([JSON.stringify(myData)], { type: 'application/json' });
const file = new File([blob], 'config.json', { type: 'application/json' });
const uploaded2 = await uploadFile(file);
console.log('File ID:', uploaded2.data.fileId);

// Retrieve data
const retrieved = await getJSON(uploaded1.data.fileId);
console.log('Config:', retrieved);
```

## 📊 Prisma Studio

To visualize and edit database data:

```bash
npx prisma studio
```

## 🗂️ Project Structure

```
arka-cdn/
├── contracts/              # Smart Contracts (Hardhat)
├── prisma/                 # Schema and migrations
│   ├── schema.prisma
│   └── migrations/
├── src/                    # Source code
│   ├── auth/              # JWT Authentication
│   ├── email/             # Email service
│   ├── prisma/            # Prisma client
│   ├── upload/            # 🆕 Upload Module
│   │   ├── dto/
│   │   │   ├── upload-file.dto.ts
│   │   │   └── upload-video.dto.ts
│   │   ├── dash-converter.service.ts
│   │   ├── upload.controller.ts
│   │   ├── upload.module.ts
│   │   └── upload.service.ts
│   ├── user/
│   ├── app.module.ts
│   └── main.ts
├── examples/              # 🆕 Example code
│   └── api-usage.ts
├── API_DOCUMENTATION.md   # 🆕 Complete documentation
├── DASH_STREAMING.md      # 🆕 Streaming guide
├── IMPLEMENTATION_SUMMARY.md  # 🆕 Summary
├── package.json
└── tsconfig.json
```

## 📡 API Endpoints

### 🔐 Authentication

- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get profile

### 📁 Upload & Storage

#### File Uploads

- `POST /api/upload/file` - **Upload file** (form-data with file)
- `POST /api/upload/plain` - **Upload plain text/JSON** (raw JSON body)
- `GET /api/upload` - List files
- `GET /api/upload/:id` - Get file info
- `GET /api/upload/:id/text` - Get text file content
- `GET /api/upload/:id/json` - Get parsed JSON file
- `DELETE /api/upload/:id` - Delete file

#### Video Streaming

- `POST /api/upload/video/dash` - **Convert video to DASH**
- `GET /api/upload/video/:id/manifest` - **Get MPD manifest**
- `GET /api/upload/video/:id/info` - **Streaming info**

> 📖 **See complete documentation:** [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

## 🎯 Detailed Features

### 🗜️ Automatic Compression

**Images:**

- Resize to max 1920x1080
- Convert to optimized JPEG
- Quality 80% with mozjpeg
- Reduction: 60-80%

**Videos:**

- Resize to max 1920x1080
- H.264 codec, medium preset
- CRF 23 (balanced quality)
- AAC audio 128kbps
- Reduction: 50-70%

### 🎬 DASH Streaming

**Available resolutions:**

- **1080p**: 1920x1080, bitrate 5000k
- **720p**: 1280x720, bitrate 2800k
- **480p**: 854x480, bitrate 1400k
- **360p**: 640x360, bitrate 800k

**Features:**

- Segmentation in 4-second chunks
- Automatic adaptation by bandwidth
- MPD manifest generation
- Compatible with DASH.js and Shaka Player

### 💾 Arkiv Storage

- Decentralized Mendoza network
- 1MB chunks
- Expiration: 30 days (configurable)
- Metadata in attributes
- Transaction hashes saved

## 🔧 Available Scripts

```bash
# Development
npm run start:dev          # Start in development mode
npm run build              # Build project
npm run start:prod         # Start in production

# Database
npm run prisma:generate    # Generate Prisma client
npm run prisma:migrate     # Run migrations
npm run prisma:studio      # Open Prisma Studio

# Blockchain (Hardhat)
npm run hardhat:compile    # Compile contracts
npm run hardhat:test       # Test contracts
npm run hardhat:deploy     # Deploy contracts

# Testing
npm run test               # Run tests
npm run test:watch         # Tests in watch mode
npm run test:cov           # Test coverage
```

## 🌐 Technologies Used

| Category       | Technologies                       |
| -------------- | ---------------------------------- |
| **Backend**    | NestJS, TypeScript, Node.js        |
| **Database**   | PostgreSQL, Prisma ORM             |
| **Blockchain** | Hardhat, Ethers.js, Solidity       |
| **Storage**    | Arkiv Network SDK                  |
| **Video**      | FFmpeg, fluent-ffmpeg              |
| **Images**     | Sharp                              |
| **Auth**       | JWT, Passport, bcryptjs            |
| **Validation** | class-validator, class-transformer |
| **Docs**       | Swagger/OpenAPI                    |
| **Email**      | Nodemailer, Resend                 |

## 📊 Limits and Configuration

| Resource         | Limit   | Configurable |
| ---------------- | ------- | ------------ |
| Normal file size | 100MB   | ✅ Yes       |
| DASH video size  | 500MB   | ✅ Yes       |
| Chunk size       | 1MB     | ✅ Yes       |
| DASH segment     | 4s      | ✅ Yes       |
| Arkiv expiration | 30 days | ✅ Yes       |
| DASH resolutions | 4       | ✅ Yes       |

## 🔒 Security

- ✅ Mandatory JWT authentication
- ✅ File type validation
- ✅ Size limits per type
- ✅ Filename sanitization
- ✅ Rate limiting (configurable)
- ✅ CORS enabled
- ✅ Helmet (security headers)

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📧 Contact

- **GitHub**: [@Emanuel250YT](https://github.com/Emanuel250YT)
- **Project**: [arka-cdn](https://github.com/Emanuel250YT/arka-cdn)

## 🙏 Acknowledgments

- [NestJS](https://nestjs.com/) - Backend framework
- [Prisma](https://www.prisma.io/) - Modern ORM
- [Arkiv Network](https://arkiv.network/) - Decentralized storage
- [FFmpeg](https://ffmpeg.org/) - Video processing
- [DASH Industry Forum](https://dashif.org/) - DASH standard

---

**⭐ If this project was useful to you, consider giving it a star on GitHub!**

**Developed with ❤️ by Emanuel250YT**
