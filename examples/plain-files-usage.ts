/**
 * Ejemplos de uso de la API para archivos planos (JSON, texto, etc.)
 */

const API_URL = 'http://localhost:3000/api';
const AUTH_TOKEN = 'your_jwt_token_here';

// ============================================
// Ejemplo 1: Subir y Obtener Archivo JSON
// ============================================

async function uploadJSONFile() {
  const configData = {
    appName: 'My App',
    version: '1.0.0',
    database: {
      host: 'localhost',
      port: 5432,
      name: 'mydb',
    },
    features: {
      enableCache: true,
      maxConnections: 100,
    },
  };

  // Crear archivo JSON desde objeto
  const blob = new Blob([JSON.stringify(configData, null, 2)], {
    type: 'application/json',
  });
  const file = new File([blob], 'config.json', { type: 'application/json' });

  // Subir a Arka CDN
  const formData = new FormData();
  formData.append('file', file);
  formData.append('description', 'Application configuration');

  const response = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: formData,
  });

  const result = await response.json();
  console.log('✅ JSON subido:', result.data);
  return result.data.fileId;
}

async function getJSONFileParsed(fileId: string) {
  const response = await fetch(`${API_URL}/upload/${fileId}/json`, {
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  });

  const result = await response.json();
  console.log('✅ JSON obtenido y parseado:', result.data.data);
  return result.data.data;
}

// ============================================
// Ejemplo 2: Subir y Obtener Archivo de Texto
// ============================================

async function uploadTextFile() {
  const textContent = `
# Mi Documento

Este es un archivo de texto de ejemplo.

## Características
- Soporte para Markdown
- Almacenamiento descentralizado
- Fácil recuperación

## Uso
Simplemente sube el archivo y obtén su contenido cuando lo necesites.
`.trim();

  const blob = new Blob([textContent], { type: 'text/markdown' });
  const file = new File([blob], 'README.md', { type: 'text/markdown' });

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: formData,
  });

  const result = await response.json();
  console.log('✅ Texto subido:', result.data);
  return result.data.fileId;
}

async function getTextFileContent(fileId: string) {
  const response = await fetch(`${API_URL}/upload/${fileId}/text`, {
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  });

  const result = await response.json();
  console.log('✅ Texto obtenido:');
  console.log(result.data.content);
  return result.data.content;
}

// ============================================
// Ejemplo 3: Subir Archivo CSV
// ============================================

async function uploadCSVFile() {
  const csvContent = `name,age,email
John Doe,30,john@example.com
Jane Smith,25,jane@example.com
Bob Johnson,35,bob@example.com`;

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const file = new File([blob], 'users.csv', { type: 'text/csv' });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('description', 'Users data export');

  const response = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: formData,
  });

  const result = await response.json();
  console.log('✅ CSV subido:', result.data);
  return result.data.fileId;
}

// ============================================
// Ejemplo 4: Subir Archivo YAML
// ============================================

async function uploadYAMLFile() {
  const yamlContent = `
version: '3.8'
services:
  app:
    image: node:18-alpine
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://localhost:5432/db
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: secret
`.trim();

  const blob = new Blob([yamlContent], { type: 'application/x-yaml' });
  const file = new File([blob], 'docker-compose.yml', {
    type: 'application/x-yaml',
  });

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: formData,
  });

  const result = await response.json();
  console.log('✅ YAML subido:', result.data);
  return result.data.fileId;
}

// ============================================
// Ejemplo 5: Subir XML
// ============================================

async function uploadXMLFile() {
  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <app>
    <name>My Application</name>
    <version>1.0.0</version>
  </app>
  <database>
    <host>localhost</host>
    <port>5432</port>
    <name>mydb</name>
  </database>
</configuration>`;

  const blob = new Blob([xmlContent], { type: 'application/xml' });
  const file = new File([blob], 'config.xml', { type: 'application/xml' });

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
    body: formData,
  });

  const result = await response.json();
  console.log('✅ XML subido:', result.data);
  return result.data.fileId;
}

// ============================================
// Ejemplo 6: Flujo Completo - Config Manager
// ============================================

class ConfigManager {
  private apiUrl: string;
  private token: string;

  constructor(apiUrl: string, token: string) {
    this.apiUrl = apiUrl;
    this.token = token;
  }

  /**
   * Guarda una configuración como JSON en Arka CDN
   */
  async saveConfig(configName: string, config: any): Promise<string> {
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: 'application/json',
    });
    const file = new File([blob], `${configName}.json`, {
      type: 'application/json',
    });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('description', `Configuration: ${configName}`);

    const response = await fetch(`${this.apiUrl}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      body: formData,
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error('Failed to save config');
    }

    console.log(`✅ Config "${configName}" guardada con ID: ${result.data.fileId}`);
    return result.data.fileId;
  }

  /**
   * Carga una configuración desde Arka CDN
   */
  async loadConfig(fileId: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/upload/${fileId}/json`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error('Failed to load config');
    }

    console.log(`✅ Config cargada desde ID: ${fileId}`);
    return result.data.data;
  }

  /**
   * Lista todas las configuraciones del usuario
   */
  async listConfigs(): Promise<any[]> {
    const response = await fetch(`${this.apiUrl}/upload`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error('Failed to list configs');
    }

    // Filtrar solo archivos JSON
    const jsonFiles = result.data.filter((file: any) =>
      file.mimeType.includes('json'),
    );

    console.log(`✅ Encontradas ${jsonFiles.length} configuraciones`);
    return jsonFiles;
  }
}

// ============================================
// Ejecutar Ejemplos
// ============================================

async function runExamples() {
  console.log('🚀 Iniciando ejemplos de archivos planos...\n');

  try {
    // Ejemplo 1: JSON
    console.log('📄 Ejemplo 1: JSON');
    const jsonFileId = await uploadJSONFile();
    await getJSONFileParsed(jsonFileId);
    console.log('');

    // Ejemplo 2: Texto/Markdown
    console.log('📝 Ejemplo 2: Texto');
    const textFileId = await uploadTextFile();
    await getTextFileContent(textFileId);
    console.log('');

    // Ejemplo 3: CSV
    console.log('📊 Ejemplo 3: CSV');
    await uploadCSVFile();
    console.log('');

    // Ejemplo 4: YAML
    console.log('⚙️ Ejemplo 4: YAML');
    await uploadYAMLFile();
    console.log('');

    // Ejemplo 5: XML
    console.log('🏷️ Ejemplo 5: XML');
    await uploadXMLFile();
    console.log('');

    // Ejemplo 6: Config Manager
    console.log('🔧 Ejemplo 6: Config Manager');
    const manager = new ConfigManager(API_URL, AUTH_TOKEN);

    const appConfig = {
      environment: 'production',
      port: 3000,
      database: {
        host: 'localhost',
        port: 5432,
      },
    };

    const configId = await manager.saveConfig('app-prod', appConfig);
    const loadedConfig = await manager.loadConfig(configId);
    console.log('Config cargada:', loadedConfig);

    await manager.listConfigs();

    console.log('\n✅ Todos los ejemplos completados!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Descomentar para ejecutar
// runExamples();

export {
  uploadJSONFile,
  getJSONFileParsed,
  uploadTextFile,
  getTextFileContent,
  uploadCSVFile,
  uploadYAMLFile,
  uploadXMLFile,
  ConfigManager,
};
