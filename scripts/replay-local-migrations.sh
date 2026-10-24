#!/usr/bin/env bash
set -Eeuo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
DB_PREFIX="${DB_PREFIX:-opsfinance_local_emulator}"
DB_NAME="${1:-${DB_PREFIX}_$(date +%Y%m%d_%H%M%S)}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

export PGPASSWORD

printf 'Creating disposable database: %s\n' "$DB_NAME"
docker exec -i opsfinance-pg psql -h "$PGHOST" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 <<SQL
CREATE DATABASE "${DB_NAME}";
SQL

mapfile -t migration_files < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort)
if [ "${#migration_files[@]}" -eq 0 ]; then
  echo 'No migration files found.' >&2
  exit 1
fi

declare -A seen_numbers=()
normalized_numbers=()
for file in "${migration_files[@]}"; do
  filename="$(basename "$file")"
  if [[ ! "$filename" =~ ^[0-9]+_ ]]; then
    echo "Migration filename is not versioned: $filename" >&2
    exit 1
  fi
  number_text="${filename%%_*}"
  if ! [[ "$number_text" =~ ^[0-9]+$ ]]; then
    echo "Migration filename has a non-numeric version: $filename" >&2
    exit 1
  fi
  number_value=$((10#$number_text))
  if [[ -n "${seen_numbers[$number_value]:-}" ]]; then
    echo "Duplicate migration number: $number_text ($filename)" >&2
    exit 1
  fi
  seen_numbers["$number_value"]=1
  normalized_numbers+=("$number_value")
done

if [ "${#normalized_numbers[@]}" -eq 0 ]; then
  echo 'No migration numbers detected.' >&2
  exit 1
fi

sorted_numbers=($(printf '%s\n' "${normalized_numbers[@]}" | sort -n))
min_number="${sorted_numbers[0]}"
max_number="${sorted_numbers[-1]}"
missing_numbers=()
for ((i=min_number; i<=max_number; i++)); do
  if [[ -z "${seen_numbers[$i]:-}" ]]; then
    missing_numbers+=("$(printf '%03d' "$i")")
  fi
done
if [ "${#missing_numbers[@]}" -gt 0 ]; then
  printf 'Migration sequence check: missing numeric versions: %s\n' "${missing_numbers[*]}"
  exit 1
else
  echo 'Migration sequence check: no missing numeric versions in the current set.'
fi

echo 'Bootstrapping local Supabase auth emulation...'
docker exec -i opsfinance-pg psql -h "$PGHOST" -U "$PGUSER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$REPO_ROOT/scripts/local-supabase-emulator.sql"

echo 'Replaying migrations in version order with fail-fast behavior...'
for file in "${migration_files[@]}"; do
  echo "-- replay: $(basename "$file")"
  docker exec -i opsfinance-pg psql -h "$PGHOST" -U "$PGUSER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$file"
  echo
 done

echo "Migration replay completed successfully for $DB_NAME"
