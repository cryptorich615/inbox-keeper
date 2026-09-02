#!/usr/bin/env bash
set -euo pipefail
umask 077
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
secret_dir="$root_dir/.local-secrets"
mkdir -p "$secret_dir"
chmod 700 "$secret_dir"
db_password="$(openssl rand -base64 36 | tr -d '\n' | tr '/+' '_-')"
sql_file="$(mktemp)"
trap 'rm -f "$sql_file"' EXIT
cat >"$sql_file" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='inbox_keeper_local') THEN
    CREATE ROLE inbox_keeper_local LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '$db_password';
  ELSE
    ALTER ROLE inbox_keeper_local PASSWORD '$db_password';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE inbox_keeper_local OWNER inbox_keeper_local'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='inbox_keeper_local')\gexec
REVOKE ALL ON DATABASE inbox_keeper_local FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE inbox_keeper_local TO inbox_keeper_local;
SQL
sudo -u postgres psql --set ON_ERROR_STOP=1 >/dev/null <"$sql_file"
printf 'DATABASE_URL=postgresql://inbox_keeper_local:%s@127.0.0.1:5432/inbox_keeper_local\n' "$db_password" >"$secret_dir/database.env"
chmod 600 "$secret_dir/database.env"
if [[ ! -f "$secret_dir/envelope.key" ]]; then openssl rand -base64 32 | tr -d '\n' >"$secret_dir/envelope.key"; fi
chmod 600 "$secret_dir/envelope.key"
echo "Local PostgreSQL and permission-restricted secret files are ready."
