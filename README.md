# SREDA Smartlink Worker

Минимальный Cloudflare Worker для домена `go.sreda.pw`. Проект обслуживает два маршрута:

- `GET /health` → возвращает `OK: sreda-go`.
- `GET /:artist/:slug` → темная HTML-страница с данными артиста и ссылки на ИСКРУ/обновления.
- Остальные пути → `404 Not found`.

## Быстрый старт

```bash
npm i
npm run dev
npm run deploy
```

### Dev
- `npm run dev` поднимает локальный превью сервер через Wrangler.

### Deploy
- `npm run deploy` деплоит Worker в ваш аккаунт Cloudflare (нужен `wrangler login`).

## Custom Domain `go.sreda.pw`
1. В Cloudflare UI откройте **Workers & Pages** → ваш Worker → **Settings**.
2. Перейдите в **Domains & Routes** и нажмите **Add custom domain**.
3. Введите `go.sreda.pw` и следуйте подсказкам для завершения привязки.

## Переменные окружения
- `ISKRA_API_BASE` — базовый URL API ИСКРЫ (например, `https://api.example.com`).
- `SMARTLINK_API_KEY` — приватный ключ для чтения смартлинков из бота. Добавляется как секрет.

### Установка секрета SMARTLINK_API_KEY в Cloudflare
```bash
# В рабочем окружении
wrangler secret put SMARTLINK_API_KEY
```
Введите ключ при запросе в терминале — он не будет записан в репозиторий.
