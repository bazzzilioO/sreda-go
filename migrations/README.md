# D1 migrations

Миграции для базы D1 находятся в этом каталоге. Применяйте их через Wrangler:

```bash
wrangler d1 migrations apply <DB_NAME>
```

Миграция `0001_add_cover_columns.sql` добавляет поля `cover_url`, `cover_version` (NOT NULL, default 0) и `cover_updated_at`, чтобы хранить текущее значение обложки и версию для инвалидации кеша на фронте.
