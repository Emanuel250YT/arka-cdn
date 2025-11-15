/**
 * Example: Retrieve a file publicly using the /data/:uuid endpoint
 * 
 * This example shows how to retrieve a file without authentication.
 * The endpoint now returns the file directly (not JSON), so it can be used
 * in HTML tags like <img>, <video>, or downloaded directly.
 */

import axios from 'axios';
import { writeFileSync } from 'fs';
import { join } from 'path';

const API_URL = 'http://localhost:3000';

async function retrieveFilePublicly(fileUuid: string) {
  try {
    console.log(`\n📥 Retrieving file ${fileUuid}...`);

    // GET request to the public endpoint (no auth required)
    // Use responseType: 'arraybuffer' to get binary data
    const response = await axios.get(`${API_URL}/data/${fileUuid}`, {
      responseType: 'arraybuffer',
    });

    // Get metadata from headers
    const contentType = response.headers['content-type'];
    const contentDisposition = response.headers['content-disposition'];
    const contentLength = parseInt(response.headers['content-length'] || '0');

    // Extract filename from Content-Disposition header
    const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
    const originalName = filenameMatch ? filenameMatch[1] : 'downloaded-file';

    console.log('\n✅ File retrieved successfully!');
    console.log(`   Name: ${originalName}`);
    console.log(`   Type: ${contentType}`);
    console.log(`   Size: ${(contentLength / 1024).toFixed(2)} KB`);

    // File data is already in buffer format
    const fileBuffer = Buffer.from(response.data);

    // Save to disk
    const outputPath = join(__dirname, '..', 'downloads', originalName);
    writeFileSync(outputPath, fileBuffer);

    console.log(`\n💾 File saved to: ${outputPath}`);

    return {
      originalName,
      mimeType: contentType,
      size: contentLength,
      localPath: outputPath,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('\n❌ Error retrieving file:');
      console.error(`   Status: ${error.response?.status}`);
      console.error(`   Message: ${error.response?.statusText || error.message}`);
    } else {
      console.error('\n❌ Unexpected error:', error);
    }
    throw error;
  }
}

// Example: Embed image in HTML
async function embedImageInHTML(fileUuid: string) {
  try {
    // For direct embedding, just use the URL directly in HTML
    const publicUrl = `${API_URL}/data/${fileUuid}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Embedded Image from Arkiv CDN</title>
</head>
<body>
  <h1>Image from Arkiv Network</h1>
  <img src="${publicUrl}" alt="Arkiv CDN Image" style="max-width: 100%;" />
  <p>Direct URL: <a href="${publicUrl}">${publicUrl}</a></p>
</body>
</html>
    `;

    const outputPath = join(__dirname, '..', 'downloads', 'embedded-image.html');
    writeFileSync(outputPath, html);

    console.log(`\n✅ HTML file created: ${outputPath}`);
    console.log('   Open it in a browser to see the embedded image!');

    return outputPath;
  } catch (error) {
    console.error('❌ Error creating HTML:', error);
    throw error;
  }
}

// Example: Share file as public URL
function getPublicURL(fileUuid: string): string {
  return `${API_URL}/data/${fileUuid}`;
}

// Main execution
async function main() {
  // Replace with an actual file UUID from your database
  const FILE_UUID = process.argv[2];

  if (!FILE_UUID) {
    console.error('❌ Please provide a file UUID as argument');
    console.log('\nUsage:');
    console.log('  ts-node examples/retrieve-file-public.ts <file-uuid>');
    console.log('\nExample:');
    console.log('  ts-node examples/retrieve-file-public.ts 550e8400-e29b-41d4-a716-446655440000');
    process.exit(1);
  }

  console.log('🚀 Arkiv CDN - Public File Retrieval Example');
  console.log('='.repeat(50));

  // 1. Retrieve and save file
  await retrieveFilePublicly(FILE_UUID);

  // 2. Get public URL (can be shared with anyone)
  const publicURL = getPublicURL(FILE_UUID);
  console.log(`\n🔗 Public URL: ${publicURL}`);
  console.log('   Share this URL to allow anyone to access the file!');

  // 3. For images, create HTML embed
  const fileInfo = await retrieveFilePublicly(FILE_UUID);
  const isImage = fileInfo.mimeType.startsWith('image/');

  if (isImage) {
    console.log('\n🎨 This is an image file, creating HTML embed...');
    await embedImageInHTML(FILE_UUID);
  }

  console.log('\n✅ Done!');
}

main().catch(console.error);
