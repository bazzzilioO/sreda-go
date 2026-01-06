interface Env {
  DB: D1Database;
  ISKRA_API_BASE: string;
  SMARTLINK_API_KEY?: string;
  ISKRA_API_KEY?: string;
  GO_INDEX_BASE?: string;
  TELEGRAM_BOT_TOKEN?: string;
}

type TelegramCoverSource = { type: "telegram"; file_id: string };
type ExternalCoverSource = { type: "external"; url: string };
type CoverSource = TelegramCoverSource | ExternalCoverSource | string;
type NormalizedCoverSourceResult = { value: string | null; error: boolean };

const TELEGRAM_FILE_ID_PATTERN = /^[A-Za-z0-9_:-]+$/;

type ApiSmartlink = {
  id?: string;
  artist?: string;
  artist_name?: string;
  title?: string;
  release_date?: string;
  links?: Record<string, string>;
  cover_url?: string;
  cover_source?: CoverSource;
  cover_version?: number;
};

type UpsertRequest = {
  id?: string | number;
  artist_slug?: string;
  slug?: string;
  title?: string;
  artist_name?: string;
  artist?: string;
  release_date?: string;
  cover_source?: unknown;
  cover_url?: string;
  cover_version?: number;
  links?: Record<string, string>;
  owner?: {
    tg_user_id?: string | number | null;
    username?: string | number | null;
    display_name?: string | number | null;
  } | null;
};

type LinkRecord = Record<string, string>;

function normalizeCoverVersionInput(input: unknown): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) return null;

  const normalized = Math.trunc(input);

  return normalized >= 0 ? normalized : 0;
}

function normalizeCoverSourceInput(input: unknown, context: string): NormalizedCoverSourceResult {
  if (input === undefined || input === null) {
    return { value: null, error: false };
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    return { value: trimmed || null, error: false };
  }

  if (typeof input === "object") {
    const candidate = input as { type?: unknown; file_id?: unknown };
    if (candidate.type === "telegram") {
      if (typeof candidate.file_id === "string") {
        const trimmedFileId = candidate.file_id.trim();
        if (validateTelegramFileId(trimmedFileId)) {
          return {
            value: JSON.stringify({ type: "telegram", file_id: trimmedFileId }),
            error: false,
          };
        }

        console.warn(`${context}: invalid telegram file_id`, candidate.file_id);
        return { value: null, error: false };
      }

      console.warn(`${context}: missing telegram file_id`, input);
      return { value: null, error: false };
    }

    if (candidate.type === "external") {
      const url = candidate.url;
      if (typeof url === "string" && url.trim()) {
        return {
          value: JSON.stringify({ type: "external", url: url.trim() }),
          error: false,
        };
      }

      console.warn(`${context}: missing external url`, input);
      return { value: null, error: false };
    }

    console.warn(`${context}: unsupported cover_source object`, input);
    return { value: null, error: false };
  }

  console.warn(`${context}: unsupported cover_source type`, input);
  return { value: null, error: false };
}

function parseCoverSource(raw: string | null, context: string): CoverSource | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { type?: unknown }).type === "telegram" &&
      typeof (parsed as { file_id?: unknown }).file_id === "string" &&
      (parsed as { file_id: string }).file_id.trim()
    ) {
      return { type: "telegram", file_id: (parsed as { file_id: string }).file_id.trim() };
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { type?: unknown }).type === "external" &&
      typeof (parsed as { url?: unknown }).url === "string" &&
      (parsed as { url: string }).url.trim()
    ) {
      return { type: "external", url: (parsed as { url: string }).url.trim() };
    }
  } catch (error) {
    console.warn(`${context}: cover_source parse error`, error, raw);
  }

  return raw;
}

function isTelegramCoverSource(source: CoverSource | null): source is TelegramCoverSource {
  return (
    Boolean(source) &&
    typeof source === "object" &&
    (source as { type?: unknown }).type === "telegram" &&
    typeof (source as { file_id?: unknown }).file_id === "string"
  );
}

function isExternalCoverSource(source: CoverSource | null): source is ExternalCoverSource {
  return (
    Boolean(source) &&
    typeof source === "object" &&
    (source as { type?: unknown }).type === "external" &&
    typeof (source as { url?: unknown }).url === "string"
  );
}

function validateTelegramFileId(fileId: string): boolean {
  return Boolean(fileId) && fileId.length <= 256 && TELEGRAM_FILE_ID_PATTERN.test(fileId);
}

function resolveCoverUrl(coverUrl?: string | null): string | null {
  if (!coverUrl) return null;

  const trimmed = coverUrl.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed, "https://placeholder.local");
    url.searchParams.delete("v");

    if (/^https?:\/\//i.test(trimmed)) {
      return url.toString();
    }

    const search = url.searchParams.toString();
    const query = search ? `?${search}` : "";
    return `${url.pathname || "/"}${query}${url.hash}`;
  } catch (error) {
    console.warn("[cover] resolveCoverUrl failed to normalize, falling back", error);
    const withoutVersion = trimmed.replace(/([?&])v=\d+(&|$)/, (match, prefix, suffix) => {
      if (prefix === "?" && suffix) return "?";
      if (prefix === "?" && !suffix) return "";
      if (prefix === "&" && suffix) return suffix;
      return "";
    });

    return withoutVersion
      .replace(/&&+/g, "&")
      .replace(/\?&/, "?")
      .replace(/[?&]$/, "");
  }
}

function buildCoverUrlWithVersion(
  coverUrl: string | null,
  coverVersion: number | null | undefined,
): string | null {
  if (!coverUrl) return null;

  const version = coverVersion ?? 0;

  try {
    const url = new URL(coverUrl, "https://placeholder.local");
    url.searchParams.delete("v");
    url.searchParams.set("v", String(version));

    if (/^https?:\/\//i.test(coverUrl)) {
      return url.toString();
    }

    const search = url.searchParams.toString();
    const query = search ? `?${search}` : "";
    return `${url.pathname || "/"}${query}${url.hash}`;
  } catch (error) {
    console.warn("[cover] failed to attach version, falling back", error);
    const separator = coverUrl.includes("?") ? "&" : "?";
    return `${coverUrl}${separator}v=${version}`;
  }
}

function extractTelegramFileId(
  coverUrl: string | undefined,
  coverSource: CoverSource | null,
  context: string,
): string | null {
  const fromUrl = extractTelegramFileIdFromString(coverUrl, context);
  if (fromUrl) return fromUrl;

  if (typeof coverSource === "string") {
    const fromSourceString = extractTelegramFileIdFromString(
      coverSource,
      `${context}:cover_source_string`,
    );
    if (fromSourceString) return fromSourceString;
  }

  if (isTelegramCoverSource(coverSource)) {
    const fileId = coverSource.file_id.trim();
    if (validateTelegramFileId(fileId)) return fileId;
    console.warn(`${context}: invalid telegram cover_source file_id`, coverSource.file_id);
  }

  return null;
}

function extractTelegramFileIdFromString(value: string | undefined, context: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  if (!trimmed.toLowerCase().startsWith("tg:")) {
    return null;
  }

  const fileId = trimmed.slice(3).trim();
  if (validateTelegramFileId(fileId)) return fileId;

  console.warn(`${context}: invalid telegram file_id in string value`);
  return null;
}

function isInternalCoverUrl(targetUrl: string, requestUrl: string): boolean {
  try {
    const resolvedTarget = new URL(targetUrl, requestUrl);
    const requestOrigin = new URL(requestUrl).origin;

    return resolvedTarget.origin === requestOrigin && resolvedTarget.pathname.startsWith("/api/cover");
  } catch (error) {
    console.warn("[cover] failed to inspect cover_url", targetUrl, error);
    return false;
  }
}

async function handleCoverProxy(
  request: Request,
  env: Env,
  artistSlug: string,
  slug: string,
): Promise<Response> {
  const cacheKey = new Request(request.url, request);

  const cached = await caches.default.match(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const query = await env.DB.prepare(
      `SELECT
        cover_source,
        cover_url
      FROM smartlinks
      WHERE artist_slug=?1 AND slug=?2
      LIMIT 1`,
    )
      .bind(artistSlug, slug)
      .all<{ cover_source: string | null; cover_url: string | null }>();

    const record = query.results?.[0];
    if (!record) {
      return new Response("Not found", { status: 404 });
    }

    return resolveCoverResponse(request, env, record, cacheKey, `[cover ${artistSlug}/${slug}]`);
  } catch (error) {
    console.error("[cover] db error", error);
    return new Response("Failed to load cover", { status: 500 });
  }
}

async function handleTelegramCover(request: Request, env: Env, fileId: string): Promise<Response> {
  const normalizedFileId = fileId.trim();

  if (!validateTelegramFileId(normalizedFileId)) {
    console.warn("[telegram cover] invalid file_id", fileId);
    return new Response("Invalid file_id", { status: 400 });
  }

  const cacheKeyUrl = new URL(`/cover/telegram/${encodeURIComponent(normalizedFileId)}`, request.url);
  const cacheKey = new Request(cacheKeyUrl.toString(), request);

  const cached = await caches.default.match(cacheKey);
  if (cached) {
    return cached;
  }

  return handleTelegramFileRequest(request, env, normalizedFileId, cacheKey);
}

async function handleTelegramFileRequest(
  request: Request,
  env: Env,
  fileId: string,
  cacheKey?: Request,
): Promise<Response> {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.warn("[telegram cover] missing TELEGRAM_BOT_TOKEN env");
    return jsonResponse({ error: "telegram_token_missing" }, 502);
  }

  try {
    const fileInfoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );

    if (!fileInfoResponse.ok) {
      console.warn("[telegram cover] getFile request failed", fileInfoResponse.status);
      return respondWithPlaceholderCover(cacheKey);
    }

    const fileInfo = (await fileInfoResponse.json()) as {
      ok?: boolean;
      result?: { file_path?: string };
      description?: string;
    };

    const filePath = fileInfo?.result?.file_path;
    if (!fileInfo?.ok || !filePath) {
      console.warn("[telegram cover] getFile response invalid", fileInfo);
      return respondWithPlaceholderCover(cacheKey);
    }

    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const fileResponse = await fetch(fileUrl);

    if (!fileResponse.ok || !fileResponse.body) {
      console.warn("[telegram cover] file fetch failed", fileResponse.status);
      if (fileResponse.status === 404) {
        return respondWithPlaceholderCover(cacheKey);
      }

      return jsonResponse(
        {
          error: "telegram_file_fetch_failed",
          status: fileResponse.status,
        },
        fileResponse.status === 404 ? 404 : 502,
      );
    }

    const fallbackEtag = `W/"tg-${fileId}-${filePath}"`;
    return finalizeImageResponse(fileResponse, cacheKey, fallbackEtag);
  } catch (error) {
    console.error("[telegram cover] fetch error", error);
    return respondWithPlaceholderCover(cacheKey);
  }
}

async function respondWithPlaceholderCover(cacheKey?: Request): Promise<Response> {
  const headers = new Headers({
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: 'W/"cover-placeholder-v1"',
  });

  const placeholder = new Response(COVER_PLACEHOLDER_SVG, {
    status: 200,
    headers,
  });

  if (cacheKey) {
    await caches.default.put(cacheKey, placeholder.clone());
  }

  return placeholder;
}

async function finalizeImageResponse(
  fileResponse: Response,
  cacheKey?: Request,
  fallbackEtag?: string,
): Promise<Response> {
  const headers = new Headers();
  const contentType = fileResponse.headers.get("content-type") ?? "image/jpeg";
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  const contentLength = fileResponse.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  const etag = fileResponse.headers.get("etag") ?? fallbackEtag;
  if (etag) {
    headers.set("ETag", etag);
  }

  headers.delete("set-cookie");

  const proxied = new Response(fileResponse.body, {
    status: 200,
    headers,
  });

  if (cacheKey) {
    await caches.default.put(cacheKey, proxied.clone());
  }

  return proxied;
}

async function handleCoverById(request: Request, env: Env, canonicalId: string): Promise<Response> {
  const cacheKey = new Request(request.url, request);

  const cached = await caches.default.match(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const query = await env.DB.prepare(
      `SELECT cover_url, cover_source FROM smartlinks WHERE id=?1 LIMIT 1`,
    )
      .bind(canonicalId)
      .all<{ cover_url: string | null; cover_source: string | null }>();

    const record = query.results?.[0];
    if (!record) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    return resolveCoverResponse(request, env, record, cacheKey, `[api/cover ${canonicalId}]`);
  } catch (error) {
    console.error("[api/cover] db error", error);
    return jsonResponse({ error: "server_error" }, 500);
  }
}

async function handleCoverBySlug(
  request: Request,
  env: Env,
  artistSlug: string,
  slug: string,
): Promise<Response> {
  const cacheKey = new Request(request.url, request);

  const cached = await caches.default.match(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const query = await env.DB.prepare(
      `SELECT cover_source, cover_url FROM smartlinks WHERE artist_slug=?1 AND slug=?2 LIMIT 1`,
    )
      .bind(artistSlug, slug)
      .all<{ cover_source: string | null; cover_url: string | null }>();

    const record = query.results?.[0];
    if (!record) {
      return new Response("Not found", { status: 404 });
    }

    return resolveCoverResponse(request, env, record, cacheKey, `[api/cover ${artistSlug}/${slug}]`);
  } catch (error) {
    console.error("[api/cover] db error", error);
    return new Response("Failed to load cover", { status: 500 });
  }
}

async function resolveCoverResponse(
  request: Request,
  env: Env,
  record: { cover_source: string | null; cover_url: string | null },
  cacheKey: Request,
  context: string,
): Promise<Response> {
  const coverSource = parseCoverSource(record.cover_source, `${context} cover_source`);
  const coverUrl = record.cover_url?.trim() || null;

  if (isTelegramCoverSource(coverSource)) {
    const fileId = coverSource.file_id.trim();
    if (!validateTelegramFileId(fileId)) {
      console.warn(`${context}: invalid telegram file_id`, coverSource.file_id);
      return new Response("Invalid cover", { status: 404 });
    }

    return handleTelegramFileRequest(request, env, fileId, cacheKey);
  }

  const externalUrl =
    (isExternalCoverSource(coverSource) && coverSource.url) ||
    (coverUrl && !isInternalCoverUrl(coverUrl, request.url) ? coverUrl : null);

  if (externalUrl && !isInternalCoverUrl(externalUrl, request.url)) {
    return handleExternalCover(request, externalUrl, cacheKey, context);
  }

  return new Response("Not found", { status: 404 });
}

async function handleExternalCover(
  request: Request,
  targetUrl: string,
  cacheKey: Request,
  context: string,
): Promise<Response> {
  try {
    const resolvedUrl = new URL(targetUrl, request.url).toString();
    const fileResponse = await fetch(resolvedUrl);

    if (!fileResponse.ok || !fileResponse.body) {
      console.warn(`[cover external] fetch failed ${context}`, resolvedUrl, fileResponse.status);
      return new Response("Failed to load cover", { status: fileResponse.status === 404 ? 404 : 502 });
    }

    const fallbackEtag = `W/"external-${resolvedUrl}"`;
    return finalizeImageResponse(fileResponse, cacheKey, fallbackEtag);
  } catch (error) {
    console.warn(`[cover external] invalid url ${context}`, targetUrl, error);
    return new Response("Invalid cover url", { status: 400 });
  }
}

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
    cover_source: payload.cover_source,
    cover_url: payload.cover_url,
    cover_version: payload.cover_version,
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
const COVER_PLACEHOLDER_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="1200" viewBox="0 0 1200 1200" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="1200" rx="140" fill="#1E1E1E" />
  <rect x="120" y="120" width="960" height="960" rx="100" fill="#262626" stroke="#262626" stroke-width="8" />
  <rect x="220" y="220" width="760" height="760" rx="80" fill="#1E1E1E" stroke="#262626" stroke-width="6" />
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="'Inter', 'Segoe UI', system-ui" font-size="96" font-weight="700" fill="#FFFFFF">SREDA</text>
  <text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle" font-family="'Inter', 'Segoe UI', system-ui" font-size="32" font-weight="500" fill="#D9D9D9">cover unavailable</text>
</svg>`;
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

async function ensureSchema(db: D1Database): Promise<void> {
  const alterStatements = [
    "ALTER TABLE smartlinks ADD COLUMN owner_tg_user_id TEXT",
    "ALTER TABLE smartlinks ADD COLUMN owner_tg_username TEXT",
    "ALTER TABLE smartlinks ADD COLUMN owner_display_name TEXT",
  ];

  for (const statement of alterStatements) {
    try {
      await db.prepare(statement).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/duplicate column name/i.test(message)) {
        continue;
      }

      console.warn(`[schema] failed to apply migration: ${statement}`, error);
      throw error;
    }
  }

  try {
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_smartlinks_owner ON smartlinks(owner_tg_user_id)").run();
  } catch (error) {
    console.warn("[schema] failed to ensure idx_smartlinks_owner", error);
    throw error;
  }
}

function normalizeOwnerInput(
  input: unknown,
): { owner: { tg_user_id: string; username: string | null; display_name: string | null } | null; error: string | null } {
  if (input === undefined || input === null) {
    return { owner: null, error: null };
  }

  if (typeof input !== "object") {
    return { owner: null, error: "owner_must_be_object" };
  }

  const candidate = input as { tg_user_id?: unknown; username?: unknown; display_name?: unknown };
  const tgUserIdRaw = candidate.tg_user_id;

  if (tgUserIdRaw === undefined || tgUserIdRaw === null) {
    return { owner: null, error: "owner_tg_user_id_required" };
  }

  const tgUserId = String(tgUserIdRaw).trim();
  if (!tgUserId) {
    return { owner: null, error: "owner_tg_user_id_empty" };
  }

  const usernameRaw = candidate.username;
  const displayNameRaw = candidate.display_name;

  const username =
    usernameRaw === undefined || usernameRaw === null ? null : String(usernameRaw).trim() || null;
  const displayName =
    displayNameRaw === undefined || displayNameRaw === null
      ? null
      : String(displayNameRaw).trim() || null;

  return {
    owner: {
      tg_user_id: tgUserId,
      username,
      display_name: displayName,
    },
    error: null,
  };
}

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

const THEME = {
  colors: {
    background: "#000000",
    gradient:
      "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.06), transparent 32%), radial-gradient(circle at 80% 0%, rgba(255,255,255,0.04), transparent 36%), linear-gradient(145deg, #0d0d0f 0%, #111112 40%, #0b0b0b 100%)",
    surface: "rgba(38,38,38,0.62)",
    surfaceStrong: "rgba(30,30,30,0.8)",
    surfaceMuted: "rgba(28,28,28,0.65)",
    accent: "#F59E0B",
    textPrimary: "#FFFFFF",
    textSecondary: "rgba(255,255,255,0.7)",
    textMuted: "rgba(255,255,255,0.38)",
    textFaint: "rgba(255,255,255,0.2)",
    border: "rgba(255,255,255,0.1)",
    borderSubtle: "rgba(255,255,255,0.08)",
  },
  fonts: {
    body: '"Inter", "SF Pro Display", "Manrope", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  radii: {
    card: "22px",
    cover: "18px",
    pill: "999px",
    glass: "20px",
  },
  shadows: {
    card: "0 18px 48px rgba(0,0,0,0.4)",
    cover: "0 12px 26px rgba(0,0,0,0.45)",
    button: "0 8px 20px rgba(0,0,0,0.3)",
    gridCard: "0 10px 28px rgba(0,0,0,0.28)",
  },
};

function prettifySlug(value: string): string {
  const normalized = value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return value;

  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function htmlPage(
  body: string,
  { title = "SREDA go", backgroundImage }: { title?: string; backgroundImage?: string | null } = {},
): string {
  const backgroundStyle = backgroundImage
    ? `--page-bg-image: url('${escapeHtml(backgroundImage)}'); --page-bg-opacity: 0.32;`
    : "--page-bg-image: none; --page-bg-opacity: 0;";
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
      align-items: flex-start;
      justify-content: center;
      position: relative;
      overflow: hidden;
      color: ${THEME.colors.textPrimary};
      font-family: ${THEME.fonts.body};
      padding: 2rem 1.25rem 2.75rem;
      background: ${THEME.colors.background};
      isolation: isolate;
    }
    body::before,
    body::after {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: -2;
    }
    body::before {
      background: ${THEME.colors.gradient};
      opacity: 0.92;
    }
    body::after {
      background-image: var(--page-bg-image);
      background-size: cover;
      background-position: center;
      filter: blur(32px) saturate(1.08);
      opacity: var(--page-bg-opacity, 0);
      transform: scale(1.04);
    }
    .noise-layer {
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E");
      z-index: -1;
      opacity: 0.5;
      mix-blend-mode: soft-light;
    }
    .card {
      width: min(820px, 100%);
      background: ${THEME.colors.surface};
      border: 1px solid ${THEME.colors.borderSubtle};
      border-radius: ${THEME.radii.glass};
      box-shadow: ${THEME.shadows.card};
      padding: 1.8rem;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(20px) saturate(1.1);
      -webkit-backdrop-filter: blur(20px) saturate(1.1);
      border-top: 1px solid rgba(255,255,255,0.06);
      isolation: isolate;
    }
    .card::before {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(255,255,255,0.04), transparent 22%);
      pointer-events: none;
      z-index: 0;
    }
    .card::after {
      content: "";
      position: absolute;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E");
      pointer-events: none;
      mix-blend-mode: soft-light;
      z-index: 0;
    }
    .card > * { position: relative; z-index: 1; }
    .smartlink-layout { display: grid; grid-template-columns: auto 1fr; gap: 1.5rem; align-items: start; }
    .cover-frame { display: flex; justify-content: center; width: 100%; }
    .cover {
      width: clamp(320px, 48vw, 580px);
      max-width: min(92vw, 620px);
      aspect-ratio: 1 / 1;
      height: auto;
      border-radius: ${THEME.radii.cover};
      border: 1px solid ${THEME.colors.borderSubtle};
      background: ${THEME.colors.surfaceStrong};
      box-shadow: ${THEME.shadows.cover};
      display: block;
      object-fit: cover;
    }
    .cover-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${THEME.colors.surfaceMuted};
      color: ${THEME.colors.textMuted};
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    a { color: inherit; text-decoration: none; }
    h1 { margin: 0; font-size: 2rem; letter-spacing: 0.01em; color: ${THEME.colors.textPrimary}; font-weight: 820; }
    p { margin: 0; color: ${THEME.colors.textSecondary}; line-height: 1.5; }
    .meta { color: ${THEME.colors.textSecondary}; font-size: 0.98rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
    .meta strong { color: ${THEME.colors.textPrimary}; }
    .meta-label { color: ${THEME.colors.textSecondary}; }
    .meta-divider { color: ${THEME.colors.textMuted}; }
    .header { display: flex; flex-direction: column; gap: 0.55rem; }
    .artist-link { color: ${THEME.colors.textPrimary}; text-decoration: none; border-bottom: 1px solid transparent; transition: color 120ms ease, border-color 120ms ease; }
    .artist-link:hover { color: ${THEME.colors.accent}; border-bottom-color: ${THEME.colors.accent}; }
    .links { margin-top: 1rem; display: grid; gap: 0.7rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .link-btn {
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.6rem;
      padding: 0.95rem 1.05rem;
      border-radius: 16px;
      border: 1px solid ${THEME.colors.borderSubtle};
      background: ${THEME.colors.surfaceMuted};
      color: ${THEME.colors.textPrimary};
      font-weight: 720;
      letter-spacing: 0.01em;
      box-shadow: ${THEME.shadows.button};
      transition: border-color 140ms ease, background 140ms ease, color 140ms ease, transform 120ms ease, box-shadow 160ms ease;
    }
    .link-btn::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: ${THEME.colors.accent}; opacity: 0.85; box-shadow: 0 0 0 4px rgba(245,158,11,0.08); }
    .link-btn:hover { border-color: ${THEME.colors.accent}; background: rgba(46,46,46,0.8); color: ${THEME.colors.textPrimary}; transform: translateY(-1px); box-shadow: 0 12px 30px rgba(0,0,0,0.35); }
    .link-btn:active { transform: translateY(0); border-color: ${THEME.colors.accent}; }
    .small { margin-top: 2rem; font-size: 0.95rem; color: ${THEME.colors.textMuted}; }
    .canonical-row { display: flex; flex-wrap: wrap; gap: 0.55rem; align-items: center; color: ${THEME.colors.textSecondary}; font-size: 0.95rem; padding-top: 0.6rem; border-top: 1px solid ${THEME.colors.border}; margin-top: 1.2rem; }
    .canonical-label { white-space: nowrap; color: ${THEME.colors.textMuted}; }
    .canonical-url { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.45rem 0.65rem; border-radius: 12px; background: rgba(30,30,30,0.72); border: 1px dashed ${THEME.colors.border}; color: ${THEME.colors.textPrimary}; font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03); }
    .copy-btn { border: 1px solid ${THEME.colors.borderSubtle}; background: ${THEME.colors.surfaceStrong}; color: ${THEME.colors.textSecondary}; border-radius: ${THEME.radii.pill}; padding: 0.45rem 0.85rem; cursor: pointer; font-weight: 720; letter-spacing: 0.01em; transition: border-color 140ms ease, background 140ms ease, color 140ms ease, box-shadow 140ms ease; box-shadow: ${THEME.shadows.button}; }
    .copy-btn:hover { border-color: ${THEME.colors.accent}; background: rgba(46,46,46,0.75); color: ${THEME.colors.accent}; box-shadow: 0 12px 28px rgba(0,0,0,0.35); }
    .copy-btn:active { border-color: ${THEME.colors.accent}; background: rgba(46,46,46,0.75); color: ${THEME.colors.accent}; box-shadow: 0 8px 18px rgba(0,0,0,0.3); }
    .copy-btn.copy-btn-small { padding: 0.32rem 0.65rem; font-size: 0.9rem; }
    .copy-toast { min-width: 110px; color: ${THEME.colors.accent}; opacity: 0; transition: opacity 180ms ease; font-weight: 700; font-size: 0.9rem; }
    .copy-toast.visible { opacity: 1; }
    .smartlink-list { display: flex; flex-direction: column; gap: 0.85rem; margin-top: 0.6rem; }
    .smartlink-item { display: grid; grid-template-columns: auto 1fr; gap: 0.95rem; padding: 1rem 1.05rem; border-radius: 16px; border: 1px solid ${THEME.colors.borderSubtle}; background: rgba(30,30,30,0.62); cursor: pointer; transition: border-color 140ms ease, transform 120ms ease, background 140ms ease, box-shadow 150ms ease; box-shadow: ${THEME.shadows.gridCard}; }
    .smartlink-item:focus-visible { outline: 2px solid ${THEME.colors.accent}; outline-offset: 2px; }
    .smartlink-item:hover { border-color: ${THEME.colors.accent}; background: rgba(38,38,38,0.82); transform: translateY(-2px); box-shadow: 0 14px 34px rgba(0,0,0,0.35); }
    .smartlink-item:active { transform: translateY(0); }
    .smartlink-cover { width: 84px; height: 84px; object-fit: cover; border-radius: 12px; border: 1px solid ${THEME.colors.borderSubtle}; background: ${THEME.colors.surface}; box-shadow: ${THEME.shadows.cover}; }
    .smartlink-cover.placeholder { display: flex; align-items: center; justify-content: center; color: ${THEME.colors.textMuted}; font-weight: 700; letter-spacing: 0.04em; font-size: 0.85rem; text-transform: uppercase; }
    .smartlink-content { display: flex; flex-direction: column; gap: 0.35rem; }
    .smartlink-title-row { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
    .smartlink-title { font-size: 1.08rem; font-weight: 820; letter-spacing: 0.01em; color: ${THEME.colors.textPrimary}; }
    .platform-chip { display: inline-flex; align-items: center; justify-content: center; padding: 0.22rem 0.65rem; border-radius: ${THEME.radii.pill}; background: rgba(46,46,46,0.7); border: 1px solid ${THEME.colors.border}; color: ${THEME.colors.textSecondary}; font-weight: 750; font-size: 0.82rem; min-width: 2rem; text-align: center; gap: 0.35rem; }
    .platform-chip::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: ${THEME.colors.accent}; box-shadow: 0 0 0 4px rgba(245,158,11,0.1); }
    .meta-row { display: flex; flex-wrap: wrap; gap: 0.45rem 0.8rem; align-items: center; color: ${THEME.colors.textSecondary};font-size: 0.92rem; }
    .meta-row.subtle { color: ${THEME.colors.textMuted}; font-size: 0.88rem; }
    .slug-pill { color: ${THEME.colors.textSecondary}; font-weight: 700; letter-spacing: 0.02em; padding: 0.12rem 0.5rem; border-radius: ${THEME.radii.pill}; background: ${THEME.colors.surface}; border: 1px dashed ${THEME.colors.border}; }
    .pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.7rem; border-radius: ${THEME.radii.pill}; background: ${THEME.colors.surface}; border: 1px solid ${THEME.colors.border}; color: ${THEME.colors.textSecondary}; font-weight: 700; }
    .pill-soft { background: ${THEME.colors.surfaceMuted}; color: ${THEME.colors.textSecondary}; border-color: ${THEME.colors.border}; }
    .artist-header { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 1.1rem; }
    .artist-name { color: ${THEME.colors.textPrimary}; font-size: 1.9rem; font-weight: 850; letter-spacing: 0.015em; }
    .artist-meta { color: ${THEME.colors.textMuted}; font-size: 0.96rem; display: inline-flex; align-items: center; gap: 0.4rem; }
    .empty-state { padding: 1.4rem; border-radius: 12px; border: 1px dashed ${THEME.colors.border}; background: ${THEME.colors.surfaceMuted}; color: ${THEME.colors.textSecondary}; }
    @media (max-width: 768px) {
      .smartlink-layout { grid-template-columns: 1fr; justify-items: center; }
      .header { text-align: center; }
    }
    @media (max-width: 640px) {
      body { padding: 1.25rem; }
      .card { padding: 1.4rem; }
      h1 { font-size: 1.5rem; }
      .cover { width: min(92vw, 420px); }
      .smartlink-item { grid-template-columns: 1fr; }
      .smartlink-cover { width: 100%; height: auto; max-height: 240px; aspect-ratio: 1 / 1; }
      .smartlink-title-row { align-items: flex-start; }
      .links { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body style="${backgroundStyle}">
  <div class="noise-layer"></div>
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

async function renderArtistPage(artistSlug: string, env: Env, goIndexBase: string): Promise<Response> {
  try {
    const query = await env.DB.prepare(
      `SELECT
        title,
        release_date,
        slug,
        cover_url,
        cover_source,
        cover_version,
        links_json,
        artist_name,
        updated_at
      FROM smartlinks
      WHERE artist_slug=?1
      ORDER BY updated_at DESC
      LIMIT 400`,
    )
      .bind(artistSlug)
      .all<{
        title: string | null;
        release_date: string | null;
        slug: string;
        cover_url: string | null;
        cover_source: string | null;
        cover_version: number | null;
        links_json: string | null;
        artist_name: string | null;
        updated_at: string | null;
      }>();

    const items = query.results ?? [];
    const displayArtistName =
      items.find((item) => item.artist_name?.trim())?.artist_name?.trim() || prettifySlug(artistSlug);
    const canonicalBase = goIndexBase.replace(/\/$/, "");
    const backgroundCover = items
      .map((item) => {
        const coverSource = parseCoverSource(item.cover_source, `[artist ${artistSlug}/${item.slug}] cover_source bg`);
        const coverVersion = normalizeCoverVersionInput(item.cover_version ?? null);
        const resolvedCoverUrl =
          resolveCoverUrl(item.cover_url ?? null) ||
          (coverSource ? `${canonicalBase}/api/cover/${encodeURIComponent(artistSlug)}/${encodeURIComponent(item.slug)}` : null);
        return buildCoverUrlWithVersion(resolvedCoverUrl, coverVersion);
      })
      .find((url) => Boolean(url));

    const cards = items.map((record) => {
      const links = parseLinksFromJson(record.links_json, `[artist ${artistSlug}/${record.slug}] links`);
      const linkCount = Object.keys(links).length;
      const coverSource = parseCoverSource(record.cover_source, `[artist ${artistSlug}/${record.slug}] cover_source`);
      const coverVersion = normalizeCoverVersionInput(record.cover_version ?? null);
      const resolvedCoverUrl =
        resolveCoverUrl(record.cover_url ?? null) ||
        (coverSource ? `${canonicalBase}/api/cover/${encodeURIComponent(artistSlug)}/${encodeURIComponent(record.slug)}` : null);
      const coverUrlWithVersion = buildCoverUrlWithVersion(resolvedCoverUrl, coverVersion);
      const canonicalUrl = `${canonicalBase}/${artistSlug}/${record.slug}`;
      const releaseDate = record.release_date
        ? `<span class="pill pill-soft">${escapeHtml(record.release_date)}</span>`
        : "";
      const slugLabel = `<span class="slug-pill">/${escapeHtml(record.slug)}</span>`;
      const metaPrimary = [releaseDate, slugLabel].filter(Boolean).join(" ");
      const title = record.title ?? "Релиз";

      return `
        <div class="smartlink-item" data-href="${escapeHtml(canonicalUrl)}" tabindex="0" role="link">
          ${
            coverUrlWithVersion
              ? `<img class="smartlink-cover" src="${escapeHtml(coverUrlWithVersion)}" alt="${escapeHtml(title)}" loading="lazy" />`
              : `<div class="smartlink-cover placeholder">NO COVER</div>`
          }
          <div class="smartlink-content">
            <div class="smartlink-title-row">
              <div class="smartlink-title">${escapeHtml(title)}</div>
              <span class="platform-chip" title="Доступные платформы">${linkCount}</span>
            </div>
            <div class="meta-row">${metaPrimary}</div>
            <div class="meta-row subtle">${
              record.updated_at ? `Обновлено ${escapeHtml(record.updated_at)}` : "Не обновлялся"
            }</div>
            <div class="canonical-row">
              <span class="canonical-label">Канонический URL</span>
              <span class="canonical-url">${escapeHtml(canonicalUrl)}</span>
              <button class="copy-btn copy-btn-small" type="button" data-url="${escapeHtml(canonicalUrl)}" aria-label="Скопировать ссылку ${escapeHtml(title)}" title="Copy link">⧉</button>
              <span class="copy-toast" role="status" aria-live="polite"></span>
            </div>
          </div>
        </div>
      `;
    });

    const body = `
      <div class="artist-header">
        <h1 class="artist-name">${escapeHtml(displayArtistName)}</h1>
        <div class="artist-meta">/${escapeHtml(artistSlug)}</div>
      </div>
      ${
        cards.length
          ? `<div class="smartlink-list">${cards.join("\n")}</div>`
          : `<div class="empty-state">Для артиста пока нет смартлинков.</div>`
      }
      <script>
        (function() {
          document.querySelectorAll('.copy-btn[data-url]').forEach((button) => {
            button.addEventListener('click', async (event) => {
              event.stopPropagation();
              const urlToCopy = button.getAttribute('data-url') || '';

              async function copyText(text) {
                if (!text) return false;
                try {
                  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                    await navigator.clipboard.writeText(text);
                    return true;
                  }
                  const textarea = document.createElement('textarea');
                  textarea.value = text;
                  textarea.setAttribute('readonly', '');
                  textarea.style.position = 'fixed';
                  textarea.style.top = '-9999px';
                  document.body.appendChild(textarea);
                  textarea.select();
                  document.execCommand('copy');
                  document.body.removeChild(textarea);
                  return true;
                } catch (error) {
                  console.warn('clipboard copy failed', error);
                  return false;
                }
              }

              const toast = button.parentElement?.querySelector('.copy-toast');
              const ok = await copyText(urlToCopy);
              if (toast) {
                toast.textContent = ok ? 'Скопировано' : 'Не удалось скопировать';
                toast.classList.add('visible');
                window.setTimeout(() => toast.classList.remove('visible'), ok ? 1300 : 1700);
              }
            });
          });

          document.querySelectorAll('.smartlink-item[data-href]').forEach((card) => {
            const href = card.getAttribute('data-href');
            if (!href) return;

            const navigate = () => {
              window.location.href = href;
            };

            card.addEventListener('click', (event) => {
              if ((event.target as HTMLElement).closest('button')) return;
              navigate();
            });

            card.addEventListener('keydown', (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate();
              }
            });
          });
        })();
      </script>
    `;

    return new Response(htmlPage(body, { title: `${displayArtistName} — SREDA`, backgroundImage: backgroundCover || null }), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=UTF-8", ...CACHE_HEADERS },
    });
  } catch (error) {
    console.error("[artist] db error", error);
    return renderError();
  }
}

function renderSmartlink(
  artistSlug: string,
  slug: string,
  data: ApiSmartlink,
  goIndexBase: string,
  smartlinkId?: string,
): Response {
  const title = data.title ?? "Релиз";
  const artistName = data.artist_name?.trim() || data.artist?.trim() || prettifySlug(artistSlug);
  const releaseDate = data.release_date;
  const coverSource = data.cover_source ?? null;
  const coverUrl = resolveCoverUrl(data.cover_url);
  const coverVersion = normalizeCoverVersionInput(data.cover_version ?? null);
  const coverUrlWithVersion = buildCoverUrlWithVersion(coverUrl, coverVersion);

  if (!coverUrlWithVersion) {
    console.warn(`[render ${artistSlug}/${slug}]: missing cover, using placeholder`, {
      cover_url: data.cover_url ?? null,
      cover_source: coverSource,
    });
  }

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

  const canonicalBase = goIndexBase.replace(/\/$/, "");
  const canonicalUrl = `${canonicalBase}/${artistSlug}/${slug}`;
  const artistLink = `<a class="artist-link" href="/${encodeURIComponent(artistSlug)}">${escapeHtml(artistName)}</a>`;

  const linkButtons = orderedEntries
    .map(([platform, url]) => {
      const label = platform.charAt(0).toUpperCase() + platform.slice(1);
      return `<a class="link-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    })
    .join("\n");

  const body = `
    <div class="smartlink-layout">
      <div class="cover-frame">
        ${
          coverUrlWithVersion
            ? `<img class="cover" src="${escapeHtml(coverUrlWithVersion)}" alt="${escapeHtml(title)}" loading="lazy" />`
            : `<div class="cover cover-placeholder">NO COVER</div>`
        }
      </div>
      <div class="header">
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">
          <span class="meta-label">Артист:</span>
          <strong>${artistLink}</strong>
          ${releaseDate ? `<span class="meta-divider">•</span><span class="meta-label">${escapeHtml(releaseDate)}</span>` : ""}
        </div>
        <div class="links">${linkButtons || "<span class=\"meta\">Ссылок пока нет</span>"}</div>
        <div class="canonical-row" style="margin-top:1.1rem;">
          <span class="canonical-label">Канонический URL</span>
          <span class="canonical-url">${escapeHtml(canonicalUrl)}</span>
          <button class="copy-btn" type="button" data-url="${escapeHtml(canonicalUrl)}" aria-label="Скопировать канонический URL">⧉</button>
          <span class="copy-toast" role="status" aria-live="polite"></span>
        </div>
      </div>
    </div>
    <script>
      (function() {
        document.querySelectorAll('.copy-btn[data-url]').forEach((button) => {
          button.addEventListener('click', async () => {
            const urlToCopy = button.getAttribute('data-url') || '';

            async function copyText(text) {
              if (!text) return false;

              try {
                if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                  await navigator.clipboard.writeText(text);
                  return true;
                }

                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.top = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                return true;
              } catch (error) {
                console.warn('clipboard copy failed', error);
                return false;
              }
            }

            const toast = button.parentElement?.querySelector('.copy-toast');
            const ok = await copyText(urlToCopy);
            if (toast) {
              toast.textContent = ok ? 'Скопировано' : 'Не удалось скопировать';
              toast.classList.add('visible');
              window.setTimeout(() => toast.classList.remove('visible'), ok ? 1300 : 1700);
            }
          });
        });
      })();
    </script>
  `;

  return new Response(htmlPage(body, { title: `${title} — ${artistName}`, backgroundImage: coverUrlWithVersion }), {
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

      await ensureSchema(env.DB);

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
          cover_version,
          links,
          slug,
          artist_slug,
          owner,
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
        const coverSourceProvided = payload !== undefined && Object.prototype.hasOwnProperty.call(payload, "cover_source");
        const coverUrlProvided = payload !== undefined && Object.prototype.hasOwnProperty.call(payload, "cover_url");
        const normalizedCoverSource = coverSourceProvided
          ? normalizeCoverSourceInput(cover_source, "[upsert] cover_source")
          : null;
        const normalizedCoverUrl = coverUrlProvided ? resolveCoverUrl(cover_url) : null;
        const { owner: normalizedOwner, error: ownerError } = normalizeOwnerInput(owner);

        if (normalizedCoverSource?.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: "invalid_cover_source" },
            400,
          );
        }

        if (ownerError) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { owner: ownerError } },
            400,
          );
        }

        let action: "insert" | "update" = "insert";
        let storedCoverUrl: string | null = null;
        let storedCoverVersion = normalizeCoverVersionInput(cover_version);
        let storedCoverSource: string | null = normalizedCoverSource?.value ?? null;
        let storedCoverUpdatedAt: string | null = null;
        let ownerSaved = false;

        try {
          const existingRecord = await env.DB.prepare(
            `SELECT
              id,
              cover_source,
              cover_version,
              cover_url,
              cover_updated_at,
              owner_tg_user_id,
              owner_tg_username,
              owner_display_name
            FROM smartlinks
            WHERE artist_slug=?1 AND slug=?2
            LIMIT 1`,
          )
            .bind(computedArtistSlug, computedSlug)
            .all<{
              id: string;
              cover_source: string | null;
              cover_version: number | null;
              cover_url: string | null;
              cover_updated_at: string | null;
              owner_tg_user_id: string | null;
              owner_tg_username: string | null;
              owner_display_name: string | null;
            }>();

          const existing = existingRecord.results?.[0];

          ownerSaved = Boolean(normalizedOwner && !existing?.owner_tg_user_id);

          if (!coverSourceProvided) {
            storedCoverSource = existing?.cover_source ?? null;
          }

          const baseCoverVersion = existing?.cover_version ?? 0;
          if (storedCoverVersion !== null) {
            storedCoverVersion = Math.max(0, storedCoverVersion);
          } else if (coverSourceProvided || coverUrlProvided) {
            storedCoverVersion = existing ? baseCoverVersion + 1 : 1;
          } else {
            storedCoverVersion = baseCoverVersion;
          }

          storedCoverVersion ??= 0;

          const goIndexBase = env.GO_INDEX_BASE?.replace(/\/$/, "") || "https://go.sreda.pw";
          const defaultCoverUrl = `${goIndexBase}/api/cover/${encodeURIComponent(computedArtistSlug)}/${encodeURIComponent(computedSlug)}`;
          const existingCoverUrl = resolveCoverUrl(existing?.cover_url ?? null);

          if (coverUrlProvided) {
            storedCoverUrl = normalizedCoverUrl;
          } else if (existingCoverUrl) {
            storedCoverUrl = existingCoverUrl;
          } else if (storedCoverSource) {
            storedCoverUrl = defaultCoverUrl;
          } else {
            storedCoverUrl = null;
          }

          const coverChanged =
            coverUrlProvided ||
            coverSourceProvided ||
            storedCoverVersion !== baseCoverVersion;
          storedCoverUpdatedAt = coverChanged
            ? new Date().toISOString()
            : existing?.cover_updated_at ?? null;

          await env.DB.prepare(
            `INSERT INTO smartlinks (
              id,
              artist_slug,
              slug,
              title,
              artist_name,
              release_date,
              owner_tg_user_id,
              owner_tg_username,
              owner_display_name,
              cover_source,
              cover_version,
              cover_url,
              cover_updated_at,
              links_json,
              created_at,
              updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, datetime('now'), datetime('now'))
            ON CONFLICT(artist_slug, slug) DO UPDATE SET
              title=excluded.title,
              artist_name=excluded.artist_name,
              release_date=excluded.release_date,
              owner_tg_user_id=COALESCE(smartlinks.owner_tg_user_id, excluded.owner_tg_user_id),
              owner_tg_username=COALESCE(smartlinks.owner_tg_username, excluded.owner_tg_username),
              owner_display_name=COALESCE(smartlinks.owner_display_name, excluded.owner_display_name),
              cover_source=excluded.cover_source,
              cover_version=excluded.cover_version,
              cover_url=excluded.cover_url,
              cover_updated_at=excluded.cover_updated_at,
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
              normalizedOwner?.tg_user_id ?? null,
              normalizedOwner?.username ?? null,
              normalizedOwner?.display_name ?? null,
              storedCoverSource,
              storedCoverVersion,
              storedCoverUrl,
              storedCoverUpdatedAt,
              linksJson,
            )
            .run();

          action = existing ? "update" : "insert";
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
                cover_source: storedCoverSource ?? undefined,
                cover_url: storedCoverUrl ?? undefined,
                cover_version: storedCoverVersion,
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
          owner_saved: ownerSaved,
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

    await ensureSchema(env.DB);

    const goIndexBase = env.GO_INDEX_BASE?.replace(/\/$/, "") || "https://go.sreda.pw";

    if (segments.length >= 3 && segments[0] === "api" && segments[1] === "cover") {
      if (segments.length === 3) {
        const canonicalId = decodeURIComponent(segments[2]);
        return handleCoverById(request, env, canonicalId);
      }

      if (segments.length === 4) {
        const artistSlug = decodeURIComponent(segments[2]);
        const slug = decodeURIComponent(segments[3]);
        return handleCoverBySlug(request, env, artistSlug, slug);
      }
    }

    if (segments.length === 2 && segments[0] === "api" && segments[1] === "my") {
      const apiKey = env.SMARTLINK_API_KEY;
      if (!apiKey) {
        return jsonResponse({ ok: false, error: "server_error" }, 500);
      }

      const providedKey = request.headers.get("X-API-Key");
      if (providedKey !== apiKey) {
        return jsonResponse({ ok: false, error: "unauthorized" }, 401);
      }

      const rawTgUserId = url.searchParams.get("tg_user_id");
      const normalizedTgUserId = rawTgUserId?.trim();

      if (!normalizedTgUserId) {
        return jsonResponse({ ok: false, error: "bad_request", details: "missing_tg_user_id" }, 400);
      }

      try {
        const query = await env.DB.prepare(
          `SELECT
            id,
            artist_slug,
            slug,
            title,
            artist_name,
            release_date,
            cover_url,
            updated_at
          FROM smartlinks
          WHERE owner_tg_user_id = ?1
          ORDER BY updated_at DESC
          LIMIT 200`)
          .bind(String(normalizedTgUserId))
          .all<{
            id: string;
            artist_slug: string;
            slug: string;
            title: string | null;
            artist_name: string | null;
            release_date: string | null;
            cover_url: string | null;
            updated_at: string | null;
          }>();

        const items = query.results ?? [];

        return jsonResponse({
          ok: true,
          tg_user_id: String(normalizedTgUserId),
          items,
          count: items.length,
        });
      } catch (error) {
        console.error("[api/my] db error", error);
        return jsonResponse({ ok: false, error: "db_error" }, 500);
      }
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
      const hasTelegramToken = Boolean(env.TELEGRAM_BOT_TOKEN);

      return jsonResponse({
        ok: true,
        hasDB,
        hasSMARTLINK_API_KEY,
        hasISKRA_API_BASE,
        hasISKRA_API_KEY,
        hasTelegramToken,
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

    if (segments.length === 3 && segments[0] === "cover" && segments[1] === "telegram") {
      const fileId = decodeURIComponent(segments[2]);
      return handleTelegramCover(request, env, fileId);
    }

    if (segments.length === 3 && segments[0] === "_cover") {
      const artistSlug = decodeURIComponent(segments[1]);
      const slug = decodeURIComponent(segments[2]);

      return handleCoverProxy(request, env, artistSlug, slug);
    }

    if (segments.length === 2 && segments[0] === "artist") {
      const artistSlug = decodeURIComponent(segments[1]);
      return renderArtistPage(artistSlug, env, goIndexBase);
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
          cover_version,
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
          cover_version: number | null;
          cover_url: string | null;
          links_json: string | null;
        }>();

      const record = query.results?.[0];
      if (!record?.id) {
        return renderNotFound("Смартлинк не найден");
      }

      const links = parseLinksFromJson(record.links_json, `[render ${artistSlug}/${slug}]`);

      const coverSource = parseCoverSource(record.cover_source, `[render ${artistSlug}/${slug}] cover_source`);

      if (!Object.keys(links).length) {
        console.warn(`[render ${artistSlug}/${slug}]: no links to render`, record.links_json);
      }

      const data: ApiSmartlink = {
        id: record.id,
        title: record.title ?? undefined,
        artist: record.artist_name ?? artistSlug,
        artist_name: record.artist_name ?? undefined,
        release_date: record.release_date ?? undefined,
        cover_version: record.cover_version ?? undefined,
        cover_url: record.cover_url ?? undefined,
        cover_source: coverSource ?? undefined,
        links,
      };

      return renderSmartlink(artistSlug, slug, data, goIndexBase, record.id);
    } catch (error) {
      console.error("smartlink fetch error", error);
      return renderError();
    }
  },
};
