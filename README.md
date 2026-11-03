# Project Planner

A self-hosted web app for managing projects, tasks, task steps, milestones, team workload, calendars, Gantt schedules, and project files.

This repository starts from a clean application snapshot. It contains no accounts, passwords, customer records, or sample database. The app is intended as a development showcase and a starting point for a local installation. Review the [security notes](docs/security.md) before deploying it beyond a trusted local environment.

## Stack

- Next.js frontend
- NestJS REST API
- Prisma and PostgreSQL
- Keycloak for sign-in and roles
- MinIO for project files
- Docker Compose for local services

## Requirements

- Docker and Docker Compose
- Node.js 22 and npm for local development or to run the npm scripts

## Quick start

1. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

2. Fill in every password and secret in `.env` with unique values. Never commit that file.
3. Start the stack:

   ```bash
   npm run docker:app
   ```

4. Open [http://localhost:3000](http://localhost:3000). On an empty database, the app prompts you to create the first administrator. That account is created in Keycloak and synchronized with the app database.

The Keycloak bootstrap account in `.env` is a technical service account, separate from the first app administrator.

## Local services

| Service | URL |
| --- | --- |
| Web app | http://localhost:3000 |
| API | http://localhost:4000/v1 |
| Keycloak | http://localhost:8080 |
| MinIO console | http://localhost:9001 |
| Mailpit | http://localhost:8025 |

## Development commands

```bash
npm run docker:build
npm run docker:app
npm run docker:logs
npm run docker:down
npm test
npm run lint
npm run build
```

See the [developer guide](docs/developer-guide.md) for the project layout and the [user guide](docs/user-guide.md) for the main workflows.

## Configuration

`.env.example` lists the required values. Generate independent secrets for PostgreSQL, Keycloak, Auth.js, and MinIO. The repository ignores `.env` and local environment overrides.

## Project status

The app interface and repository documentation are in English. Production hardening tasks are listed in the [security notes](docs/security.md).
