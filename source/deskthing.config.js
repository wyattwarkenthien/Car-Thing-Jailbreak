import { defineConfig } from '@deskthing/cli';
export default defineConfig({
  development: {
    logging: { level: "info", prefix: "[Westward Server]" },
    client: { logging: { level: "info", prefix: "[Westward Client]", enableRemoteLogging: false },
      clientPort: 3000, viteLocation: "http://localhost", vitePort: 5173, linkPort: 8080 },
    server: { editCooldownMs: 8000 }
  }
});
