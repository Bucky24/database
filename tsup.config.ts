import { defineConfig } from 'tsup';

// External packages (not bundled) - yup is bundled
const external = ['mysql2', 'pg', 'express', 'fs', 'path'];

export default defineConfig([
    // Both entries together with splitting to share common modules
    {
        entry: {
            index: 'index.ts',
            client: 'client.ts',
        },
        format: ['cjs', 'esm'],
        dts: { resolve: true },
        tsconfig: 'tsconfig.build.json',
        outDir: 'build',
        clean: true,
        external,
        splitting: true,  // Creates shared chunks so both entries share the same module instances
    },
]);