#!/bin/sh
# Builds a throw-away local database, applies the cloud setup twice, runs the security test.
# Needs a local PostgreSQL server (run as a user that can create databases, e.g. postgres).
set -e
# when started as root (e.g. via npm), re-run as the postgres user
if [ "$(id -u)" = "0" ] && [ -z "$L997_AS_PG" ]; then exec su postgres -c "L997_AS_PG=1 sh '$0'"; fi
DB=l997_cloud_test_$$
DIR=$(cd "$(dirname "$0")" && pwd)
createdb "$DB"
trap 'dropdb "$DB"' EXIT
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f "$DIR/auth_stub.sql" -f "$DIR/../setup.sql" -f "$DIR/../setup.sql" >/dev/null 2>&1
OUT=$(psql -X -d "$DB" -f "$DIR/security_test.sql" 2>&1)
echo "$OUT" | sed -n 's/^.*NOTICE:  //p'
PASS=$(echo "$OUT" | grep -c "NOTICE:  PASS" || true)
FAIL=$(echo "$OUT" | grep -c "NOTICE:  FAIL" || true)
OTHER=$(echo "$OUT" | grep -E "ERROR" || true)
echo "passed: $PASS  failed: $FAIL"
[ -z "$OTHER" ] || { echo "unexpected errors:"; echo "$OTHER"; exit 1; }
[ "$FAIL" -eq 0 ] && [ "$PASS" -gt 0 ]
