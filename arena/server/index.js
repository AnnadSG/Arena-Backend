import { config } from './config.js';
import { createStore } from './db/index.js';
import { runInWorker } from './ai/runner.js';
import { createApp } from './app.js';

const store = await createStore();
const { server } = createApp({ store, runAI: runInWorker, aiDelayMs: config.aiDelayMs, corsOrigin: config.corsOrigin });

server.listen(config.port, () => {
  console.log(`Arena a correr em http://localhost:${config.port} (armazenamento: ${store.kind})`);
});

const shutdown = async () => {
  server.close();
  await store.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
