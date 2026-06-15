# Dev Bills

## Docker Compose

Run the local development stack:

```bash
docker compose up --build
```

Open `http://localhost:3000`.

The default `docker-compose.yml` is for development and uses fixed local values:

- `app`: Next.js development server with source mounted into the container
- `postgres`: PostgreSQL database with persistent Docker volume
- `DATABASE_URL`: `postgresql://devbills:devbills@postgres:5432/devbills`
- App port: `3000`
- Postgres host port: `5432`

The app container applies Prisma migrations before starting `next dev`.

To reset local Docker data:

```bash
docker compose down -v
```

## Coolify Production

Production uses the separate Compose file:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

Set production secrets in Coolify shared/environment variables, not in the repository.
Required variables:

- `DATABASE_URL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

Optional variables:

- `APP_PORT` defaults to `3000`
- `APP_IMAGE` defaults to `dev-bills-app`

When using the bundled Postgres service, `DATABASE_URL` should point at the Compose service host:

```bash
postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>
```

Postgres is not published to the host by default. Only the app port is exposed.

## Local Development

Run without Docker:

```bash
npm install
npm run dev
```

Without `DATABASE_URL`, the app falls back to in-memory bill storage for quick UI work.
For persistent local development, run Postgres and set:

```bash
DATABASE_URL="postgresql://<user>:<password>@localhost:5432/<database>"
```
