import { createServer as httpServer } from "node:http";
import { createServer as httpsServer } from "node:https";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "./app.js";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer from 1 to 65535.");
const token = process.env.LOCAL_ACCESS_TOKEN || "";
if (!["127.0.0.1", "localhost", "::1"].includes(host) && token.length < 24) {
  throw new Error(
    "LAN binding requires LOCAL_ACCESS_TOKEN with at least 24 characters.",
  );
}
const certPath = process.env.TLS_CERT_PATH;
const keyPath = process.env.TLS_KEY_PATH;
if (Boolean(certPath) !== Boolean(keyPath))
  throw new Error("Configure both TLS_CERT_PATH and TLS_KEY_PATH.");
const { app, close } = createApp({
  databasePath: resolve(process.env.DATABASE_PATH || "./data/lifeflow.sqlite"),
  token,
  allowedOrigins: (
    process.env.ALLOWED_ORIGINS ||
    "http://localhost:5173,http://127.0.0.1:5173,capacitor://localhost"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  staticDir: resolve("dist"),
});
const server =
  certPath && keyPath
    ? httpsServer(
        {
          cert: readFileSync(resolve(certPath)),
          key: readFileSync(resolve(keyPath)),
        },
        app,
      )
    : httpServer(app);
server.listen(port, host, () =>
  console.log(
    `LifeFlow local API: ${certPath ? "https" : "http"}://${host}:${port}`,
  ),
);
function shutdown() {
  server.close(() => {
    close();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
