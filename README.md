# Dev Bills

## Docker Compose

Run the production-style stack locally:

```bash
docker compose up --build
```

Open `http://localhost:3000`.

The compose stack runs:

- `app`: Next.js production server
- `postgres`: PostgreSQL database with persistent Docker volume

The app container runs Prisma migrations before starting.

## Local Development

Run without Docker:

```bash
npm install
npm run dev
```

Without `DATABASE_URL`, the app falls back to in-memory bill storage for quick UI work.
For persistent local development, run Postgres and set:

```bash
DATABASE_URL="postgresql://devbills:devbills@localhost:5432/devbills"
```
