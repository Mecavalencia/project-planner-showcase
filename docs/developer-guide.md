# Developer guide

## Requirements

- Node.js 22 and npm
- Docker and Docker Compose
- Free local ports: 3000, 4000, 5432, 6379, 8080, 9000, 9001, and 8025

## Start locally

From the repository root:

```bash
cp .env.example .env
# Fill in every password and secret in .env.
npm run docker:app
```

The first visit to http://localhost:3000 prompts you to create the app administrator. The repository does not include user accounts or passwords.

## Layout

- `apps/web`: Next.js App Router, Auth.js, and the user interface.
- `apps/api`: NestJS REST API, Prisma, and Keycloak JWT validation.
- `packages/shared`: shared domain constants, Zod schemas, and utilities.
- `docker/keycloak`: a realm template with placeholders and no users.

## Authentication flow

1. The user opens the web app.
2. Auth.js redirects the browser to Keycloak.
3. Keycloak issues an OIDC token.
4. The web app keeps a server-side session and calls the API with a bearer token.
5. The API validates the token against Keycloak's JWKS and checks app permissions.

## Database

Prisma reads `DATABASE_URL` from the environment. Docker applies migrations when the API starts. For local development:

```bash
npm run db:generate
npm run db:migrate
```

## Checks

```bash
npm test
npm run lint
npm run build
```

If a Windows build cannot write `apps/web/.next/trace`, stop any running Next.js dev process and remove its generated `.next` directory before retrying. If Prisma cannot replace `query_engine-windows.dll.node`, stop the API process before running `npm run db:generate` again.
