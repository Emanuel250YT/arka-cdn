import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/types.ts',
    'src/crypto/index.ts',
    'src/upload/index.ts',
    'src/download/index.ts',
    'src/entity/index.ts',
    'src/file/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['@arkiv-network/sdk'],
  treeshake: true,
  define: {
    __VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
})
