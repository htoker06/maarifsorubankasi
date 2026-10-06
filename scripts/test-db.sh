#!/usr/bin/env bash
# Veritabanı şemasını yerel PostgreSQL'de sıfırdan kurup davranış testlerini çalıştırır.
# Gereksinim: yerel PostgreSQL (psql). Bağlantı: PGHOST/PGUSER vb. ortam değişkenleri ya da varsayılan "postgres" kullanıcısı.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-sbm_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)
if [ "$(id -u)" = "0" ] && [ -z "${PGUSER:-}" ]; then PSQL=(su postgres -c); fi

run() { # run <db> <file>
  if [ "${PSQL[0]}" = "su" ]; then su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $1 -f $2"; else "${PSQL[@]}" -d "$1" -f "$2"; fi
}
sql() { # sql <db> <command>
  if [ "${PSQL[0]}" = "su" ]; then su postgres -c "psql -X -q -v ON_ERROR_STOP=1 -d $1 -c \"$2\""; else "${PSQL[@]}" -d "$1" -c "$2"; fi
}

sql postgres "drop database if exists $DB" >/dev/null
sql postgres "create database $DB" >/dev/null
run "$DB" supabase/tests/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do run "$DB" "$f"; done
run "$DB" supabase/tests/10_schema_test.sql 2>&1 | sed 's/^psql:[^:]*:[0-9]*: //'
