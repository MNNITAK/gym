import "reflect-metadata";
import { config } from "dotenv";
import path from "node:path";
// Load the monorepo-root .env regardless of the cwd the process is started from.
config({ path: path.resolve(__dirname, "../../../.env") });
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import express from "express";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });

  // Capture the raw body on the WhatsApp webhook so we can verify Meta's HMAC signature.
  app.use(
    "/webhooks/whatsapp",
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(express.json());

  app.enableCors({ origin: true, credentials: true });

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[keystone/api] listening on http://localhost:${port}`);
}

bootstrap();
