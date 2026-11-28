#!/usr/bin/env bash
# 本機 PostgreSQL 驗證 schema.sql（不需 Supabase）。用法：PGHOST=/tmp PGPORT=5499 bash supabase/test/run.sh
set -e
D=cf_test_$$
createdb "$D"
psql -q -d "$D" -f "$(dirname "$0")/stub-supabase.sql" 2>/dev/null || true
psql -q -d "$D" -c 'grant all on all tables in schema public to anon, authenticated'   # 模擬 Supabase 預設授權
psql -q -d "$D" -1 -v ON_ERROR_STOP=1 -f "$(dirname "$0")/../schema.sql" 2>&1 | grep -v NOTICE || true
psql -q -d "$D" -1 -v ON_ERROR_STOP=1 -f "$(dirname "$0")/../schema.sql" 2>&1 | grep -v NOTICE || true  # 可重複執行
psql -d "$D" -f "$(dirname "$0")/security.sql"
dropdb "$D"
