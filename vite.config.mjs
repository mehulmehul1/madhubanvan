// Vite config for the Madhubani WebGPU viewer (app/).
// The library engine (src/) is renderer-agnostic JS; only app/ and src/core/render talk to three.
//
// `three` is aliased to `three/webgpu` so the engine's own `import ... from 'three'` (skeleton.js,
// dqs.js, motion engines) and the render layer's `three/webgpu` resolve to ONE three instance.
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'app',
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  server: { port: 5175, host: true },
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
