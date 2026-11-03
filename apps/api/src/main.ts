import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";
import { BigIntInterceptor } from "./utils/bigint.interceptor";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const port = Number(process.env.API_PORT ?? 4000);

  const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "x-dev-user"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
  });
  app.setGlobalPrefix("v1");
  app.useGlobalInterceptors(new BigIntInterceptor());

  await app.listen(port);
  console.log(`Planner API running on http://localhost:${port}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
