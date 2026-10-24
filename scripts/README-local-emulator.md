# Local PostgreSQL Supabase emulation harness

This folder is intentionally local-only and not part of the production deployment.

## Purpose

The repository cannot validate live Supabase staging in this environment, but a plain PostgreSQL instance can emulate the minimal Supabase auth contracts required by the migration SQL.

## Files

- `local-supabase-emulator.sql`: creates the minimal `auth` schema, role definitions, and `auth.uid()` function.
- `replay-local-migrations.sh`: creates a disposable database, runs the migration set in numeric order, and exits on the first failure.
- `local-tenant-regression.sql`: exercises cross-business read/write denial, idempotency, atomic rollback, and posted-journal immutability under an authenticated session.

## Usage

```bash
./scripts/replay-local-migrations.sh
psql -h 127.0.0.1 -U postgres -d <database_name> -f scripts/local-tenant-regression.sql
```

The disposable DB is created in Docker and left isolated from any production or other local databases.
