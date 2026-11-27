# 在本機 PostgreSQL 驗證 schema.sql（不需 Supabase）
```
createdb t
psql -d t -f supabase/test/stub-supabase.sql   # 模擬 auth.users、auth.uid()、anon/authenticated 角色
psql -d t -1 -v ON_ERROR_STOP=1 -f supabase/schema.sql   # 可重複執行
psql -d t -f supabase/test/behavior.sql        # 匿名待審、組員核可、不可刪改、審核紀錄、限流、未來時間、無效地點
```
已於 PostgreSQL 16 驗證（2026-11-27）。這是模擬環境，正式 Supabase 的 auth 行為仍以實際專案為準。
