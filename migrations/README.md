# D1 migrations

Миграции для базы D1 находятся в этом каталоге. Применяйте их через Wrangler:

```bash
wrangler d1 migrations apply <DB_NAME>
```

Миграция `0001_add_cover_columns.sql` добавляет поля `cover_source`, `cover_file_id`, `cover_version` (DEFAULT 1) и `cover_updated_at`, чтобы синхронизировать схему с актуальным payload. Поле `cover_url` остаётся как legacy, если оно уже присутствует в таблице.
