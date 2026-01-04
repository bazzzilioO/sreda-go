interface Env {
  DB: D1Database;
  ISKRA_API_BASE: string;
  SMARTLINK_API_KEY?: string;
  GO_INDEX_BASE?: string;
}

type ApiSmartlink = {
  artist?: string;
  title?: string;
  release_date?: string;
  links?: Record<string, string>;
};

type UpsertRequest = {
  id?: string | number;
  artist_slug?: string;
  slug?: string;
  title?: string;
  artist_name?: string;
  artist?: string;
  release_date?: string;
  cover_source?: string;
  links?: Record<string, string>;
};

function slugify(value?: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSlug(value: string | undefined | null, id?: string | number): string | undefined {
  const slug = slugify(value);
  if (slug) return slug;
  if (id !== undefined && id !== null) {
    return `release-${id}`;
  }
  return undefined;
}

async function syncSmartlinkToWeb(
  payload: UpsertRequest,
  env: Env,
): Promise<[boolean, number | null, string | null]> {
  const apiKey = env.SMARTLINK_API_KEY;
  if (!apiKey) return [false, null, "missing_api_key"];

  const goIndexBase = env.GO_INDEX_BASE?.replace(/\/$/, "") || "https://go.sreda.pw";

  const artistSlug = buildSlug(
    payload.artist_slug ?? payload.artist_name ?? payload.artist,
    payload.id,
  );
  const slug = buildSlug(payload.slug ?? payload.title, payload.id);

  if (!payload.id || !artistSlug || !slug || !payload.title) {
    console.warn("smartlink sync skipped", payload.id, artistSlug, slug, payload.title);
    return [false, null, "invalid_payload"];
  }

  const body = {
    id: payload.id,
    artist_slug: artistSlug,
    slug,
    title: payload.title,
    artist_name: payload.artist_name,
    release_date: payload.release_date,
    links: payload.links,
  };

  try {
    const response = await fetch(`${goIndexBase}/api/index/upsert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "X-Skip-Sync": "1",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("smartlink sync failed", response.status, errorText);
      return [false, response.status, errorText || null];
    }
    return [true, response.status, null];
  } catch (error) {
    console.warn("smartlink sync error", error);
    return [false, null, error instanceof Error ? error.message : String(error)];
  }
}

const CACHE_HEADERS = { "Cache-Control": "public, max-age=60" } as const;
const LINK_ORDER = [
  "telegram",
  "spotify",
  "apple",
  "yandex",
  "vk",
  "youtube",
  "bandlink",
  "other",
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}

function htmlPage(body: string, { title = "SREDA go" } = {}): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 20% 20%, #142033 0%, #0b0f1a 45%, #080b12 100%);
      color: #e6e9ef;
      font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 1.5rem;
    }
    .card {
      width: min(640px, 100%);
      background: rgba(16, 24, 40, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      padding: 2.5rem;
      backdrop-filter: blur(6px);
    }
    a { color: inherit; }
    h1 { margin: 0 0 0.5rem; font-size: 2rem; letter-spacing: 0.01em; color: #f4f6fb; }
    p { margin: 0; color: #c8d0e2; }
    .meta { margin-top: 0.5rem; color: #b9c1d6; }
    .meta strong { color: #f3b266; }
    .links { margin-top: 1.5rem; display: grid; gap: 0.75rem; }
    .link-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.9rem 1.2rem;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.06);
      color: #e6e9ef;
      font-weight: 700;
      text-decoration: none;
      transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
    }
    .link-btn:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.16); box-shadow: 0 18px 30px rgba(0,0,0,0.35); }
    .small { margin-top: 2rem; font-size: 0.95rem; color: #98a4bd; }
    .tag { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.65rem; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); font-size: 0.9rem; color: #cfd7ea; }
  </style>
</head>
<body>
  <main class="card">
    ${body}
  </main>
</body>
</html>`;
}

function renderHome(): Response {
  const body = `<h1>SREDA go</h1>
    <p>Укороченные ссылки для релизов SREDA.</p>
    <p class="meta">Используйте формат <strong>go.sreda.pw/&lt;artist&gt;/&lt;slug&gt;</strong>.</p>`;
  return new Response(htmlPage(body, { title: "SREDA go" }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=UTF-8", ...CACHE_HEADERS },
  });
}

function renderNotFound(message = "Ссылка не найдена"): Response {
  const body = `<h1>404</h1><p class="meta">${escapeHtml(message)}</p>`;
  return new Response(htmlPage(body, { title: "Не найдено" }), {
    status: 404,
    headers: { "Content-Type": "text/html; charset=UTF-8", ...CACHE_HEADERS },
  });
}

function renderError(): Response {
  const body = `<h1>Временная ошибка</h1><p class="meta">Не удалось загрузить данные. Попробуйте позже.</p>`;
  return new Response(htmlPage(body, { title: "Ошибка" }), {
    status: 502,
    headers: { "Content-Type": "text/html; charset=UTF-8", ...CACHE_HEADERS },
  });
}

function renderSmartlink(
  artistSlug: string,
  slug: string,
  data: ApiSmartlink,
): Response {
  const title = data.title ?? "Релиз";
  const artist = data.artist ?? artistSlug;
  const releaseDate = data.release_date;

  const links = data.links ?? {};
  const orderedEntries: [string, string][] = [];

  for (const key of LINK_ORDER) {
    if (key === "other") {
      continue;
    }
    const url = links[key];
    if (url) {
      orderedEntries.push([key, url]);
    }
  }

  const remaining = Object.entries(links).filter(
    ([platform]) => !LINK_ORDER.includes(platform),
  );
  if (remaining.length) {
    orderedEntries.push(...remaining);
  }

  const otherUrl = links["other"];
  if (otherUrl) {
    orderedEntries.push(["other", otherUrl]);
  }

  const linkButtons = orderedEntries
    .map(([platform, url]) => {
      const label = platform.charAt(0).toUpperCase() + platform.slice(1);
      return `<a class="link-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    })
    .join("\n");

  const body = `
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">Артист: <strong>${escapeHtml(artist)}</strong>${releaseDate ? ` • ${escapeHtml(releaseDate)}` : ""}</p>
    <div class="links">${linkButtons || "<span class=\"meta\">Ссылок пока нет</span>"}</div>
    <p class="small">Канонический URL: <span class="tag">go.sreda.pw/${escapeHtml(artistSlug)}/${escapeHtml(slug)}</span></p>
  `;

  return new Response(htmlPage(body, { title: `${title} — ${artist}` }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=UTF-8", ...CACHE_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
    const segments = normalizedPath.split("/").filter(Boolean);
    const goIndexBase = env.GO_INDEX_BASE?.replace(/\/$/, "") || "https://go.sreda.pw";

    if (normalizedPath === "/api/index/upsert") {
      if (request.method === "GET") {
        return new Response("OK: /api/index/upsert жив. Используй POST + X-API-Key + JSON body.", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=UTF-8" },
        });
      }

      if (request.method !== "POST") {
        return jsonResponse({ error: "method_not_allowed" }, 405);
      }

      const apiKey = env.SMARTLINK_API_KEY;
      if (!apiKey) {
        return jsonResponse({ error: "server_error" }, 500);
      }

      const providedKey = request.headers.get("X-API-Key");
      if (providedKey !== apiKey) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }

      let payload: UpsertRequest;
      try {
        payload = (await request.json()) as UpsertRequest;
      } catch (error) {
        console.error("upsert parse error", error);
        return jsonResponse({ error: "bad_request" }, 400);
      }

      const { id, title, artist_name, artist, release_date, cover_source, links, slug, artist_slug } =
        payload ?? {};

      const computedArtistSlug = buildSlug(
        artist_slug ?? artist_name ?? artist,
        id,
      );
      const computedSlug = buildSlug(slug ?? title, id);

      if (!id || !computedArtistSlug || !computedSlug || !title) {
        return jsonResponse({ error: "bad_request" }, 400);
      }

      const linksJson = JSON.stringify(typeof links === "object" && links ? links : {});

      try {
        await env.DB.prepare(
          `INSERT INTO smartlinks (
            id, artist_slug, slug, title, artist_name, release_date, cover_source, links_json, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), datetime('now'))
          ON CONFLICT(artist_slug, slug) DO UPDATE SET
            id=excluded.id,
            title=excluded.title,
            artist_name=excluded.artist_name,
            release_date=excluded.release_date,
            cover_source=excluded.cover_source,
            links_json=excluded.links_json,
            updated_at=datetime('now')
        `,
        )
          .bind(
            String(id),
            computedArtistSlug,
            computedSlug,
            title,
            artist_name ?? null,
            release_date ?? null,
            cover_source ?? null,
            linksJson,
          )
          .run();

        let syncResult: [boolean, number | null, string | null] = [false, null, null];
        if (!request.headers.get("X-Skip-Sync")) {
          try {
            syncResult = await syncSmartlinkToWeb(
              {
                ...payload,
                id,
                artist_slug: computedArtistSlug,
                slug: computedSlug,
                artist_name,
                title,
                release_date,
                cover_source,
                links,
              },
              env,
            );
          } catch (error) {
            console.warn("smartlink sync error", error);
            syncResult = [false, null, error instanceof Error ? error.message : String(error)];
          }
        }

        const [synced, syncStatus, syncError] = syncResult;

        const webUrl = `${goIndexBase}/${computedArtistSlug}/${computedSlug}`;

        return jsonResponse({
          ok: true,
          web_url: webUrl,
          sync: {
            ok: synced,
            status: syncStatus,
            error: syncError,
          },
        });
      } catch (error) {
        console.error("upsert db error", error);
        return jsonResponse({ error: "server_error" }, 500);
      }
    }

    if (request.method !== "GET") {
      return renderNotFound();
    }

    if (normalizedPath === "/health") {
      return new Response("OK: sreda-go | GIT-LIVE", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=UTF-8", ...CACHE_HEADERS },
      });
    }

    if (segments.length === 0) {
      return renderHome();
    }

    if (segments.length !== 2) {
      return renderNotFound();
    }

    const [artistSlug, slug] = segments.map((segment) => decodeURIComponent(segment));

    try {
      const query = await env.DB.prepare(
        "SELECT id FROM smartlinks WHERE artist_slug=?1 AND slug=?2 LIMIT 1",
      )
        .bind(artistSlug, slug)
        .all<{ id: string }>();

      const record = query.results?.[0];
      if (!record?.id) {
        return renderNotFound("Смартлинк не найден");
      }

      const base = env.ISKRA_API_BASE?.replace(/\/$/, "");
      if (!base) {
        return renderError();
      }

      const headers = new Headers();
      if (env.SMARTLINK_API_KEY) {
        headers.set("X-API-Key", env.SMARTLINK_API_KEY);
      }

      const response = await fetch(`${base}/api/smartlink/${record.id}`, { headers });

      if (response.status === 404) {
        return renderNotFound("Смартлинк отсутствует в боте");
      }

      if (!response.ok) {
        return renderError();
      }

      const data = (await response.json()) as ApiSmartlink;
      return renderSmartlink(artistSlug, slug, data);
    } catch (error) {
      console.error("smartlink fetch error", error);
      return renderError();
    }
  },
};
