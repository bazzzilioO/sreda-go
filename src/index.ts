interface Env {
  DB: D1Database;
  ISKRA_API_BASE: string;
  SMARTLINK_API_KEY?: string;
  ISKRA_API_KEY?: string;
  GO_INDEX_BASE?: string;
}

type ApiSmartlink = {
  artist?: string;
  title?: string;
  release_date?: string;
  links?: Record<string, string>;
  cover_url?: string;
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
  cover_url?: string;
  links?: Record<string, string>;
};

type LinkRecord = Record<string, string>;

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

function normalizeLinksInput(input: unknown, context: string): LinkRecord {
  const normalized: LinkRecord = {};

  if (input === undefined || input === null) {
    return normalized;
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return normalized;

    try {
      return normalizeLinksInput(JSON.parse(trimmed), context);
    } catch (error) {
      console.warn(`${context}: links string is not JSON, storing as 'other'`, trimmed);
      normalized.other = trimmed;
      return normalized;
    }
  }

  if (Array.isArray(input)) {
    for (const entry of input) {
      if (entry && typeof entry === "object") {
        const platform =
          (entry as { platform?: string; name?: string }).platform ??
          (entry as { name?: string }).name;
        const url = (entry as { url?: string; link?: string }).url ?? (entry as { link?: string }).link;

        if (platform && url && typeof platform === "string" && typeof url === "string") {
          normalized[platform] = url;
          continue;
        }
      }

      if (Array.isArray(entry) && entry.length >= 2) {
        const [platform, url] = entry as unknown[];
        if (typeof platform === "string" && typeof url === "string") {
          normalized[platform] = url;
          continue;
        }
      }

      console.warn(`${context}: skipping unrecognized link entry`, entry);
    }

    return normalized;
  }

  if (typeof input === "object") {
    for (const [platform, value] of Object.entries(input as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) {
        normalized[platform] = value;
      } else if (value !== undefined && value !== null) {
        console.warn(`${context}: non-string link value dropped`, platform, value);
      }
    }

    return normalized;
  }

  console.warn(`${context}: unsupported links payload`, input);
  return normalized;
}

function parseLinksFromJson(linksJson: string | null, context: string): LinkRecord {
  if (!linksJson) {
    console.warn(`${context}: links_json missing or null`);
    return {};
  }

  try {
    const parsed = JSON.parse(linksJson);
    const normalized = normalizeLinksInput(parsed, `${context}:parse`);

    if (!Object.keys(normalized).length) {
      console.warn(`${context}: parsed links empty`, linksJson);
    }

    return normalized;
  } catch (error) {
    console.warn(`${context}: links_json parse error`, error, linksJson);
    return {};
  }
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
    cover_url: payload.cover_url,
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
    .cover {
      width: 100%;
      height: auto;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
      margin-bottom: 1.5rem;
      display: block;
      object-fit: cover;
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
  const coverUrl = data.cover_url;

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
    ${coverUrl ? `<img class="cover" src="${escapeHtml(coverUrl)}" alt="${escapeHtml(title)}" loading="lazy" />` : ""}
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

    if (normalizedPath === "/api/index/upsert") {
      if (request.method === "GET") {
        return new Response("OK: /api/index/upsert жив. Используй POST + X-API-Key + JSON body.", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=UTF-8" },
        });
      }

      if (request.method !== "POST") {
        return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
      }

      const apiKey = env.SMARTLINK_API_KEY;
      if (!apiKey) {
        return jsonResponse({ ok: false, error: "server_error" }, 500);
      }

      const providedKey = request.headers.get("X-API-Key");
      const isAuthed = providedKey === apiKey;
      if (!isAuthed) {
        return jsonResponse({ ok: false, error: "unauthorized" }, 401);
      }

      try {
        let payload: UpsertRequest;
        try {
          payload = (await request.json()) as UpsertRequest;
        } catch (error) {
          console.error("upsert parse error", error);
          return jsonResponse({ ok: false, error: "bad_request", details: "invalid_json" }, 400);
        }

        const {
          id,
          title,
          artist_name,
          artist,
          release_date,
          cover_source,
          cover_url,
          links,
          slug,
          artist_slug,
        } = payload ?? {};

        const computedArtistSlug = buildSlug(
          artist_slug ?? artist_name ?? artist,
          id,
        );
        const computedSlug = buildSlug(slug ?? title, id);

        if (!computedArtistSlug || !computedSlug || !title) {
          return jsonResponse({ ok: false, error: "bad_request" }, 400);
        }

        const canonicalId = `${computedArtistSlug}:${computedSlug}`;
        const normalizedLinks = normalizeLinksInput(links, "[upsert] links");
        const linksJson = JSON.stringify(normalizedLinks);

        let action: "inserted" | "updated" = "inserted";

        try {
          const existingRecord = await env.DB.prepare(
            `SELECT id FROM smartlinks WHERE artist_slug=?1 AND slug=?2 LIMIT 1`,
          )
            .bind(computedArtistSlug, computedSlug)
            .all<{ id: string }>();

          await env.DB.prepare(
            `INSERT INTO smartlinks (
              id, artist_slug, slug, title, artist_name, release_date, cover_source, cover_url, links_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'), datetime('now'))
            ON CONFLICT(artist_slug, slug) DO UPDATE SET
              title=excluded.title,
              artist_name=excluded.artist_name,
              release_date=excluded.release_date,
              cover_source=excluded.cover_source,
              cover_url=excluded.cover_url,
              links_json=excluded.links_json,
              updated_at=datetime('now')`,
          )
            .bind(
              canonicalId,
              computedArtistSlug,
              computedSlug,
              title,
              artist_name ?? null,
              release_date ?? null,
              cover_source ?? null,
              cover_url ?? null,
              linksJson,
            )
            .run();

          action = existingRecord.results?.[0] ? "updated" : "inserted";
        } catch (error) {
          console.error("[upsert] db error", error);
          return jsonResponse(
            { ok: false, error: "db_error", message: error instanceof Error ? error.message : String(error) },
            500,
          );
        }

        const skipSync = request.headers.get("X-Skip-Sync") === "1" || isAuthed;

        let syncResult: [boolean, number | null, string | null] = [true, null, null];
        if (!skipSync) {
          try {
            syncResult = await syncSmartlinkToWeb(
              {
                ...payload,
                id: canonicalId,
                artist_slug: computedArtistSlug,
                slug: computedSlug,
                artist_name,
                title,
                release_date,
                cover_source,
                cover_url,
                links: normalizedLinks,
              },
              env,
            );
          } catch (error) {
            console.warn("smartlink sync error", error);
            syncResult = [false, null, error instanceof Error ? error.message : String(error)];
          }
        }

        const [synced, syncStatus, syncError] = syncResult;
        if (!synced) {
          return jsonResponse({ ok: false, error: "sync_failed", details: { status: syncStatus, error: syncError } }, 502);
        }

        return jsonResponse({
          ok: true,
          action,
          artist_slug: computedArtistSlug,
          slug: computedSlug,
          id: canonicalId,
        });
      } catch (err) {
        console.error("[upsert] error", err);
        return jsonResponse(
          { ok: false, error: "server_error", details: String((err as { message?: string } | null)?.message ?? err) },
          500,
        );
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

    if (normalizedPath === "/debug") {
      const hasDB = Boolean(env.DB);
      const hasSMARTLINK_API_KEY = Boolean(env.SMARTLINK_API_KEY);
      const hasISKRA_API_BASE = Boolean(env.ISKRA_API_BASE);
      const hasISKRA_API_KEY = Boolean(env.ISKRA_API_KEY);

      return jsonResponse({
        ok: true,
        hasDB,
        hasSMARTLINK_API_KEY,
        hasISKRA_API_BASE,
        hasISKRA_API_KEY,
        vars: {
          ISKRA_API_BASE: env.ISKRA_API_BASE ?? null,
        },
      });
    }

    if (
      segments.length === 3 &&
      segments[0] === "debug" &&
      segments[1] === "iskra" &&
      segments[2] === "latest"
    ) {
      const base = env.ISKRA_API_BASE?.replace(/\/$/, "");

      if (!base) {
        return jsonResponse({ error: "missing_iskra_api_base" }, 500);
      }

      const urlToFetch = `${base}/api/smartlink/latest`;
      const headers: HeadersInit = {};

      if (env.ISKRA_API_KEY) {
        headers["X-API-Key"] = env.ISKRA_API_KEY;
      }

      try {
        const iskraResponse = await fetch(urlToFetch, { headers });
        const bodyText = await iskraResponse.text();

        return jsonResponse({
          iskra_base: env.ISKRA_API_BASE,
          has_key: Boolean(env.ISKRA_API_KEY),
          url: urlToFetch,
          status: iskraResponse.status,
          ok: iskraResponse.ok,
          body: bodyText.slice(0, 2000),
        });
      } catch (error) {
        return jsonResponse({
          iskra_base: env.ISKRA_API_BASE,
          has_key: Boolean(env.ISKRA_API_KEY),
          url: urlToFetch,
          status: null,
          ok: false,
          body: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (
      segments.length === 3 &&
      segments[0] === "debug" &&
      segments[1] === "iskra"
    ) {
      const id = decodeURIComponent(segments[2]);
      const base = env.ISKRA_API_BASE?.replace(/\/$/, "");

      if (!base) {
        return jsonResponse({ error: "missing_iskra_api_base" }, 500);
      }

      const urlToFetch = `${base}/api/smartlink/${id}`;
      const headers: HeadersInit = {};

      if (env.ISKRA_API_KEY) {
        headers["X-API-Key"] = env.ISKRA_API_KEY;
      }

      try {
        const iskraResponse = await fetch(urlToFetch, { headers });
        const bodyText = await iskraResponse.text();

        return jsonResponse({
          iskra_base: env.ISKRA_API_BASE,
          has_key: Boolean(env.ISKRA_API_KEY),
          url: urlToFetch,
          status: iskraResponse.status,
          ok: iskraResponse.ok,
          body: bodyText.slice(0, 2000),
        });
      } catch (error) {
        return jsonResponse({
          iskra_base: env.ISKRA_API_BASE,
          has_key: Boolean(env.ISKRA_API_KEY),
          url: urlToFetch,
          status: null,
          ok: false,
          body: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
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
        `SELECT
          id,
          artist_slug,
          slug,
          title,
          artist_name,
          release_date,
          cover_source,
          cover_url,
          links_json
        FROM smartlinks
        WHERE artist_slug=?1 AND slug=?2
        LIMIT 1`,
      )
        .bind(artistSlug, slug)
        .all<{
          id: string;
          artist_slug: string;
          slug: string;
          title: string | null;
          artist_name: string | null;
          release_date: string | null;
          cover_source: string | null;
          cover_url: string | null;
          links_json: string | null;
        }>();

      const record = query.results?.[0];
      if (!record?.id) {
        return renderNotFound("Смартлинк не найден");
      }

      const links = parseLinksFromJson(record.links_json, `[render ${artistSlug}/${slug}]`);

      if (!Object.keys(links).length) {
        console.warn(`[render ${artistSlug}/${slug}]: no links to render`, record.links_json);
      }

      const data: ApiSmartlink = {
        title: record.title ?? undefined,
        artist: record.artist_name ?? artistSlug,
        release_date: record.release_date ?? undefined,
        cover_url: record.cover_url ?? undefined,
        links,
      };

      return renderSmartlink(artistSlug, slug, data);
    } catch (error) {
      console.error("smartlink fetch error", error);
      return renderError();
    }
  },
};
