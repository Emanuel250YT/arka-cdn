# OpenLeague Backend

Backend en NestJS con soporte para Prisma (ORM) y Hardhat (Smart Contracts).

## 🚀 Características

- **NestJS**: Framework progresivo de Node.js para aplicaciones server-side
- **Prisma**: ORM moderno para TypeScript y Node.js
- **Hardhat**: Entorno de desarrollo para Ethereum
- **Smart Contracts**: Contrato TournamentManager para gestión de torneos on-chain
- **Autenticación JWT**: Sistema completo de auth con tokens revocables
- **Multi-Wallet**: Soporte para vincular múltiples wallets (Ethereum, Polygon, BSC, etc.)
- **Login con Wallet**: Autenticación con wallet + OTP por email
- **Swagger**: Documentación interactiva de API REST
- **TypeScript**: Tipado estático completo
- **Validación**: Class-validator para validación de DTOs

## 📋 Requisitos Previos

- Node.js (v18 o superior)
- PostgreSQL (para Prisma)
- npm o yarn

## 🛠️ Instalación

1. **Clonar o navegar al proyecto**

```bash
cd openleague-backend
```

2. **Instalar dependencias**

```bash
npm install
```

3. **Configurar variables de entorno**

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus configuraciones:

- `DATABASE_URL`: URL de conexión a PostgreSQL
- `JWT_SECRET`: Clave secreta para firmar tokens JWT
- `JWT_ACCESS_EXPIRATION`: Tiempo de expiración de access tokens (ej: "15m")
- `JWT_REFRESH_EXPIRATION`: Tiempo de expiración de refresh tokens (ej: "7d")
- `EMAIL_HOST`: Servidor SMTP (ej: "smtp.gmail.com")
- `EMAIL_PORT`: Puerto SMTP (587)
- `EMAIL_USER`: Tu email para enviar mensajes
- `EMAIL_PASSWORD`: Contraseña de aplicación de Gmail
- `RPC_URL`: URL del proveedor RPC (Alchemy, Infura, etc.)
- `PRIVATE_KEY`: Clave privada para deployments
- `CONTRACT_ADDRESS`: Dirección del contrato desplegado

4. **Configurar Prisma**

```bash
# Generar el cliente de Prisma
npm run prisma:generate

# Ejecutar migraciones
npm run prisma:migrate
```

5. **Compilar Smart Contracts**

```bash
npm run hardhat:compile
```

## 🏃‍♂️ Ejecución

### Desarrollo

```bash
npm run start:dev
```

El servidor estará disponible en `http://localhost:3000/api`

**📚 Documentación Swagger:** `http://localhost:3000/api/docs`

### Producción

```bash
npm run build
npm run start:prod
```

## 🔗 Blockchain

### Iniciar red local de Hardhat

```bash
npx hardhat node
```

### Desplegar contratos

```bash
# Red local
npm run hardhat:deploy

# Red de prueba (Sepolia)
npx hardhat run scripts/deploy.ts --network sepolia
```

### Probar contratos

```bash
npm run hardhat:test
```

## 📊 Prisma Studio

Para visualizar y editar datos en la base de datos:

```bash
npm run prisma:studio
```

## 🗂️ Estructura del Proyecto

```
openleague-backend/
├── contracts/              # Smart Contracts de Solidity
│   └── TournamentManager.sol
├── prisma/                 # Configuración de Prisma
│   └── schema.prisma
├── scripts/                # Scripts de deployment
│   └── deploy.ts
├── src/                    # Código fuente
│   ├── auth/              # Módulo de autenticación
│   │   ├── decorators/
│   │   ├── dto/
│   │   ├── entities/
│   │   ├── guards/
│   │   ├── interfaces/
│   │   ├── strategies/
│   │   ├── auth.controller.ts
│   │   ├── auth.module.ts
│   │   └── auth.service.ts
│   ├── email/             # Módulo de email
│   │   ├── email.module.ts
│   │   └── email.service.ts
│   ├── prisma/            # Módulo de Prisma
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── users/             # Módulo de usuarios
│   │   ├── dto/
│   │   ├── users.controller.ts
│   │   ├── users.module.ts
│   │   └── users.service.ts
│   ├── app.controller.ts
│   ├── app.module.ts
│   ├── app.service.ts
│   └── main.ts
├── hardhat.config.ts      # Configuración de Hardhat
├── AUTH_SYSTEM.md         # Documentación del sistema de autenticación
├── QUICK_START.md         # Guía de inicio rápido
├── package.json
└── tsconfig.json
```

## 📡 API Endpoints

### General

- `GET /api` - Mensaje de bienvenida
- `GET /api/health` - Health check

### Autenticación 🔐

- `POST /api/auth/register` - Registrar usuario
- `POST /api/auth/login` - Login (email/contraseña o wallet)
- `POST /api/auth/verify-otp` - Verificar código OTP
- `POST /api/auth/refresh` - Refrescar access token
- `POST /api/auth/logout` - Cerrar sesión (requiere JWT)
- `POST /api/auth/wallets` - Vincular wallet (requiere JWT)
- `GET /api/auth/wallets` - Listar wallets (requiere JWT)
- `GET /api/auth/me` - Obtener perfil (requiere JWT)

> 📖 **Documentación completa:** Ver [AUTH_SYSTEM.md](./AUTH_SYSTEM.md)

### Usuarios

- `POST /api/users` - Crear usuario
- `GET /api/users` - Listar usuarios
- `GET /api/users/:id` - Obtener usuario por ID
- `GET /api/users/wallet/:address` - Obtener usuario por wallet
- `PATCH /api/users/:id` - Actualizar usuario
- `DELETE /api/users/:id` - Eliminar usuario

### Blockchain

- `POST /api/blockchain/tournament` - Crear torneo on-chain
- `GET /api/blockchain/tournament/:id` - Obtener torneo
- `POST /api/blockchain/tournament/:id/participant` - Agregar participante
- `GET /api/blockchain/tournament/:id/participants` - Listar participantes
- `POST /api/blockchain/tournament/:id/payout` - Pagar a ganadores

## 🧪 Testing

```bash
# Tests unitarios
npm run test

# Tests e2e
npm run test:e2e

# Coverage
npm run test:cov
```

## 🎯 Ejemplos de Uso

### Registrar y autenticar un usuario

```bash
# 1. Registrar usuario
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "player@example.com",
    "password": "SecurePass123!",
    "name": "Player One"
  }'

# 2. Vincular wallet al usuario (usando el accessToken del registro)
curl -X POST http://localhost:3000/api/auth/wallets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "network": "ethereum",
    "currency": "ETH",
    "isDefault": true
  }'

# 3. Login con wallet (recibe OTP por email)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"}'

# 4. Verificar OTP
curl -X POST http://localhost:3000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "code": "123456"
  }'
```

### Crear un torneo on-chain

```bash
curl -X POST http://localhost:3000/api/blockchain/tournament \
  -H "Content-Type: application/json" \
  -d '{"name": "Championship 2024", "prizePool": "1.0"}'
```

### Crear un usuario

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "email": "player@example.com",
    "name": "Player One",
    "walletAddress": "0x..."
  }'
```

## 🔐 Smart Contract

El contrato `TournamentManager` incluye:

- Creación de torneos con prize pool
- Gestión de participantes
- Distribución de premios
- Control de acceso (solo organizador)
- Protección contra reentrancy

## 📚 Documentación Adicional

- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Hardhat Documentation](https://hardhat.org/docs)

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

MIT

## 👨‍💻 Autor

Tu nombre aquí
