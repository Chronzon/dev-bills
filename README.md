# Dev Bills

## Docker Compose

Run the production-style stack locally:

```bash
cp .env.example .env
docker compose up --build -d
```

Open `http://localhost:3000`.

The compose stack runs:

- `app`: Next.js production server
- `postgres`: PostgreSQL database with persistent Docker volume
- `migrate`: one-off Prisma migration service

The `migrate` service applies Prisma migrations before the app starts.

## Coolify Production

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
