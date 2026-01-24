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
type NormalizedCoverSourceResult = { value: string | null; error: string | null };
type NormalizedLinksResult = { value: LinkRecord; error: string | null };
type FieldError = { code: string; message: string; field?: string };

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
type OwnerRecord = {
  tg_user_id: string;
  username: string | null;
  display_name: string | null;
};

// ==================== Anti-phishing URL allowlist (server-side) ====================
const PLATFORM_ALLOWED_HOSTS: Record<string, string[]> = {
  spotify: ["open.spotify.com", "spotify.link", "spoti.fi"],
  apple: ["music.apple.com", "geo.music.apple.com", "apple.co"],
  itunes: ["itunes.apple.com", "music.apple.com", "apple.co"],
  yandex: ["music.yandex.ru"],
  vk: ["vk.com", "m.vk.com"],
  deezer: ["www.deezer.com", "deezer.com", "deezer.page.link"],
  youtube: ["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"],
  youtubemusic: ["music.youtube.com"],
  zvuk: ["zvuk.com", "open.zvuk.com"],
  kion: ["kion.ru", "music.mts.ru"],
  bandlink: ["band.link", "bandlink.to"],
  telegram: ["t.me", "telegram.me"],
};

function normalizeHostname(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = (u.hostname || "").trim().toLowerCase();
    return host.endsWith(".") ? host.slice(0, -1) : host;
  } catch {
    return "";
  }
}

function isAllowedPlatformUrl(platform: string, rawUrl: string): boolean {
  const p = (platform || "").trim().toLowerCase();
  const allowed = PLATFORM_ALLOWED_HOSTS[p];
  if (!allowed) return false;
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) return false;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return false;
  }
  const proto = (u.protocol || "").toLowerCase();
  if (proto !== "http:" && proto !== "https:") return false;
  const host = normalizeHostname(trimmed);
  if (!host) return false;
  for (const canon of allowed) {
    const c = canon.toLowerCase();
    if (host === c || host.endsWith("." + c)) return true;
  }
  return false;
}

function enforceLinksAllowlist(
  links: LinkRecord,
  context: string,
): { value: LinkRecord; rejected: LinkRecord; error: string | null } {
  const value: LinkRecord = {};
  const rejected: LinkRecord = {};
  for (const [k, v] of Object.entries(links || {})) {
    const platform = String(k || "").trim().toLowerCase();
    const url = String(v || "").trim();
    if (!platform || !url) continue;
    // Only enforce for known platforms; unknown keys are dropped to avoid storing arbitrary phishing vectors.
    if (!Object.prototype.hasOwnProperty.call(PLATFORM_ALLOWED_HOSTS, platform)) {
      continue;
    }
    if (isAllowedPlatformUrl(platform, url)) {
      value[platform] = url;
    } else {
      rejected[platform] = url;
      console.warn(`${context}: rejected non-canonical host`, platform, url);
    }
  }
  const hasRejected = Object.keys(rejected).length > 0;
  return { value, rejected, error: hasRejected ? "links_invalid_domain" : null };
}

function normalizeCoverVersionInput(input: unknown): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) return null;

  const normalized = Math.trunc(input);

  return normalized >= 0 ? normalized : 0;
}

function normalizeCoverSourceInput(input: unknown, context: string): NormalizedCoverSourceResult {
  if (input === undefined || input === null) {
    return { value: null, error: null };
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    return { value: trimmed || null, error: null };
  }

  if (typeof input === "object") {
    const candidate = input as { type?: unknown; file_id?: unknown; url?: unknown };
    if (candidate.type === "telegram") {
      if (typeof candidate.file_id === "string") {
        const trimmedFileId = candidate.file_id.trim();
        if (validateTelegramFileId(trimmedFileId)) {
          return {
            value: JSON.stringify({ type: "telegram", file_id: trimmedFileId }),
            error: null,
          };
        }

        console.warn(`${context}: invalid telegram file_id`, candidate.file_id);
        return { value: null, error: "invalid_cover_source_file_id" };
      }

      console.warn(`${context}: missing telegram file_id`, input);
      return { value: null, error: "missing_cover_source_file_id" };
    }

    if (candidate.type === "external") {
      const url = candidate.url;
      if (typeof url === "string" && url.trim()) {
        return {
          value: JSON.stringify({ type: "external", url: url.trim() }),
          error: null,
        };
      }

      console.warn(`${context}: missing external url`, input);
      return { value: null, error: "missing_cover_source_url" };
    }

    console.warn(`${context}: unsupported cover_source object`, input);
    return { value: null, error: "invalid_cover_source_type" };
  }

  console.warn(`${context}: unsupported cover_source type`, input);
  return { value: null, error: "invalid_cover_source_type" };
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

function resolvePreferredCoverUrl({
  coverUrl,
  coverSource,
  artistSlug,
  slug,
  goIndexBase,
  context,
}: {
  coverUrl?: string | null;
  coverSource?: CoverSource | string | null;
  artistSlug: string;
  slug: string;
  goIndexBase: string;
  context: string;
}): string | null {
  const canonicalBase = goIndexBase.replace(/\/$/, "");
  const parsedCoverSource =
    typeof coverSource === "string" ? parseCoverSource(coverSource, context) : coverSource ?? null;

  if (isTelegramCoverSource(parsedCoverSource)) {
    return `${canonicalBase}/api/cover/${encodeURIComponent(artistSlug)}/${encodeURIComponent(slug)}`;
  }

  if (isExternalCoverSource(parsedCoverSource)) {
    return resolveCoverUrl(parsedCoverSource.url) ?? null;
  }

  return resolveCoverUrl(coverUrl ?? null);
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

function buildCoverCacheKey(request: Request, coverVersion: number | null | undefined): Request {
  const url = new URL(request.url);
  const normalizedVersion = normalizeCoverVersionInput(coverVersion ?? null);

  if (normalizedVersion !== null) {
    url.searchParams.set("v", String(normalizedVersion));
  }

  return new Request(url.toString(), request);
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
  try {
    const query = await env.DB.prepare(
      `SELECT
        cover_source,
        cover_url,
        cover_version
      FROM smartlinks
      WHERE artist_slug=?1 AND slug=?2
      LIMIT 1`,
    )
      .bind(artistSlug, slug)
      .all<{ cover_source: string | null; cover_url: string | null; cover_version: number | null }>();

    const record = query.results?.[0];
    if (!record) {
      return new Response("Not found", { status: 404 });
    }

    const cacheKey = buildCoverCacheKey(request, record.cover_version);
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      return cached;
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
  try {
    const query = await env.DB.prepare(
      `SELECT cover_url, cover_source, cover_version FROM smartlinks WHERE id=?1 LIMIT 1`,
    )
      .bind(canonicalId)
      .all<{ cover_url: string | null; cover_source: string | null; cover_version: number | null }>();

    const record = query.results?.[0];
    if (!record) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    const cacheKey = buildCoverCacheKey(request, record.cover_version);
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      return cached;
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
  try {
    const query = await env.DB.prepare(
      `SELECT cover_source, cover_url, cover_version FROM smartlinks WHERE artist_slug=?1 AND slug=?2 LIMIT 1`,
    )
      .bind(artistSlug, slug)
      .all<{ cover_source: string | null; cover_url: string | null; cover_version: number | null }>();

    const record = query.results?.[0];
    if (!record) {
      return new Response("Not found", { status: 404 });
    }

    const cacheKey = buildCoverCacheKey(request, record.cover_version);
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      return cached;
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

  if (!coverSource) {
    return respondWithPlaceholderCover(cacheKey);
  }

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

  return respondWithPlaceholderCover(cacheKey);
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

const RU_TO_LATIN_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function transliterate(value?: string | null): string {
  if (!value) return "";

  return value
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      const mapped = RU_TO_LATIN_MAP[lower];
      return mapped !== undefined ? mapped : char;
    })
    .join("");
}

function slugify(value?: string | null): string {
  if (!value) return "";
  const transliterated = transliterate(value);
  return transliterated
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSlug(
  value: string | undefined | null,
  { allowFallback = false, fallbackValue }: { allowFallback?: boolean; fallbackValue?: string } = {},
): string | undefined {
  const slug = slugify(value);
  if (slug) return slug;
  if (allowFallback && fallbackValue) {
    return fallbackValue;
  }
  return undefined;
}

function deriveSlugsFromPayload(payload: UpsertRequest): {
  artistSlug?: string;
  releaseSlug?: string;
  errors: FieldError[];
} {
  const errors: FieldError[] = [];
  const artistSource = payload.artist_slug ?? payload.artist_name ?? payload.artist;
  const manualSlugProvided =
    payload.slug !== undefined && payload.slug !== null && String(payload.slug).trim();
  const releaseSource = manualSlugProvided ? payload.slug : payload.title;
  const releaseSlug = buildSlug(releaseSource, { allowFallback: false });
  const artistSlug = buildSlug(artistSource, { allowFallback: false });

  if (!artistSlug) {
    errors.push({
      code: "artist_slug_required",
      message: "Укажите artist_slug или artist_name.",
      field: "artist_slug",
    });
  }

  if (!releaseSlug) {
    errors.push({
      code: "slug_required",
      message: manualSlugProvided
        ? "Поле slug пустое или содержит недопустимые символы."
        : "Укажите title или slug для генерации slug.",
      field: manualSlugProvided ? "slug" : "title",
    });
  }

  return { artistSlug, releaseSlug, errors };
}

function normalizeLinksInput(
  input: unknown,
  context: string,
  { strict = false }: { strict?: boolean } = {},
): NormalizedLinksResult {
  const normalized: LinkRecord = {};

  if (input === undefined || input === null) {
    return { value: normalized, error: null };
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return { value: normalized, error: null };

    try {
      return normalizeLinksInput(JSON.parse(trimmed), context, { strict });
    } catch (error) {
      console.warn(`${context}: links string is not JSON`, trimmed);
      if (strict) {
        return { value: normalized, error: "links_invalid_json" };
      }
      normalized.other = trimmed;
      return { value: normalized, error: null };
    }
  }

  if (Array.isArray(input)) {
    let hasValid = false;
    for (const entry of input) {
      if (entry && typeof entry === "object") {
        const platform =
          (entry as { platform?: string; name?: string }).platform ??
          (entry as { name?: string }).name;
        const url = (entry as { url?: string; link?: string }).url ?? (entry as { link?: string }).link;

        if (platform && url && typeof platform === "string" && typeof url === "string") {
          normalized[platform] = url;
          hasValid = true;
          continue;
        }
      }

      if (Array.isArray(entry) && entry.length >= 2) {
        const [platform, url] = entry as unknown[];
        if (typeof platform === "string" && typeof url === "string") {
          normalized[platform] = url;
          hasValid = true;
          continue;
        }
      }

      console.warn(`${context}: skipping unrecognized link entry`, entry);
    }

    if (strict && !hasValid && input.length > 0) {
      return { value: normalized, error: "links_empty" };
    }

    return { value: normalized, error: null };
  }

  if (typeof input === "object") {
    let hasValid = false;
    for (const [platform, value] of Object.entries(input as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) {
        normalized[platform] = value.trim();
        hasValid = true;
      } else if (value !== undefined && value !== null) {
        console.warn(`${context}: non-string link value dropped`, platform, value);
      }
    }

    if (strict && !hasValid && Object.keys(input as Record<string, unknown>).length > 0) {
      return { value: normalized, error: "links_empty" };
    }

    return { value: normalized, error: null };
  }

  console.warn(`${context}: unsupported links payload`, input);
  return { value: normalized, error: strict ? "links_invalid_type" : null };
}

function parseLinksFromJson(linksJson: string | null, context: string): LinkRecord {
  if (!linksJson) {
    console.warn(`${context}: links_json missing or null`);
    return {};
  }

  try {
    const parsed = JSON.parse(linksJson);
    const normalized = normalizeLinksInput(parsed, `${context}:parse`).value;

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

  const goIndexBase = env.GO_INDEX_BASE?.replace(/\/$/, "");
  if (!goIndexBase) {
    return [false, null, "missing_go_index_base"];
  }

  const { artistSlug, releaseSlug: slug, errors } = deriveSlugsFromPayload(payload);

  if (errors.length || !payload.id || !artistSlug || !slug || !payload.title) {
    console.warn("smartlink sync skipped", {
      id: payload.id,
      artistSlug,
      slug,
      title: payload.title,
      errors,
    });
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
const COVER_PLACEHOLDER_DATA_URL = `data:image/svg+xml,${encodeURIComponent(COVER_PLACEHOLDER_SVG)}`;
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
    "ALTER TABLE smartlinks ADD COLUMN cover_file_id TEXT",
    "ALTER TABLE smartlinks ADD COLUMN owner_tg_user_id TEXT",
    "ALTER TABLE smartlinks ADD COLUMN owner_tg_username TEXT",
    "ALTER TABLE smartlinks ADD COLUMN owner_display_name TEXT",
    "ALTER TABLE smartlinks ADD COLUMN caption_text TEXT",
    "ALTER TABLE smartlinks ADD COLUMN flags TEXT",
    "ALTER TABLE smartlinks ADD COLUMN artist_photo_url TEXT",
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

function normalizeOwnerInput(input: unknown): { owner: OwnerRecord | null; error: FieldError | null } {
  if (input === undefined || input === null) {
    return { owner: null, error: null };
  }

  if (typeof input !== "object") {
    return {
      owner: null,
      error: {
        code: "owner_must_be_object",
        message: "Поле owner должно быть объектом.",
        field: "owner",
      },
    };
  }

  const candidate = input as { tg_user_id?: unknown; username?: unknown; display_name?: unknown };
  const tgUserIdRaw = candidate.tg_user_id;

  if (tgUserIdRaw === undefined || tgUserIdRaw === null) {
    return {
      owner: null,
      error: {
        code: "owner_tg_user_id_required",
        message: "Укажите owner.tg_user_id.",
        field: "owner.tg_user_id",
      },
    };
  }

  const tgUserId = String(tgUserIdRaw).trim();
  if (!tgUserId) {
    return {
      owner: null,
      error: {
        code: "owner_tg_user_id_empty",
        message: "Поле owner.tg_user_id не может быть пустым.",
        field: "owner.tg_user_id",
      },
    };
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

function normalizeTextInput(input: unknown, context: string): { value: string | null; error: string | null } {
  if (input === undefined || input === null) {
    return { value: null, error: null };
  }

  if (typeof input === "string") {
    return { value: input.trim() || null, error: null };
  }

  if (typeof input === "number" || typeof input === "boolean") {
    return { value: String(input), error: null };
  }

  console.warn(`${context}: expected text input`, input);
  return { value: null, error: "invalid_text" };
}

function normalizeFlagsInput(input: unknown, context: string): { value: string | null; error: string | null } {
  if (input === undefined || input === null) {
    return { value: null, error: null };
  }

  if (typeof input === "string") {
    return { value: input.trim() || null, error: null };
  }

  try {
    return { value: JSON.stringify(input), error: null };
  } catch (error) {
    console.warn(`${context}: flags JSON stringify failed`, error);
    return { value: null, error: "invalid_flags" };
  }
}

function buildOwnerResponse(record: {
  owner_tg_user_id?: string | null;
  owner_tg_username?: string | null;
  owner_display_name?: string | null;
}): OwnerRecord | null {
  if (!record.owner_tg_user_id) {
    return null;
  }

  return {
    tg_user_id: String(record.owner_tg_user_id),
    username: record.owner_tg_username ? String(record.owner_tg_username) : null,
    display_name: record.owner_display_name ? String(record.owner_display_name) : null,
  };
}

function requireEnvValue(
  value: string | undefined,
  envName: string,
  message: string,
): Response | null {
  if (!value) {
    return jsonResponse(
      {
        ok: false,
        error: "missing_env",
        details: {
          env: envName,
          message,
        },
      },
      503,
    );
  }
  return null;
}

function requireIndexAuth(request: Request, env: Env): Response | null {
  const token = env.SMARTLINK_API_KEY;
  const envError = requireEnvValue(
    token,
    "SMARTLINK_API_KEY",
    "Настройте SMARTLINK_API_KEY, чтобы использовать защищенные API эндпоинты.",
  );
  if (envError) {
    return envError;
  }

  const header = request.headers.get("Authorization") || request.headers.get("authorization");
  if (!header) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : header.trim();
  if (!provided || provided !== token) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  return null;
}

function getOwnerTgId(url: URL): string | null {
  const rawOwnerId =
    url.searchParams.get("tg_id") ??
    url.searchParams.get("owner_tg_user_id") ??
    url.searchParams.get("owner_tg_id") ??
    url.searchParams.get("tg_user_id");
  const ownerTgId = rawOwnerId?.trim();
  return ownerTgId ? ownerTgId : null;
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

function formatDisplayDate(value?: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}.${month}.${year}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, "0");
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const year = parsed.getFullYear();
    return `${day}.${month}.${year}`;
  }

  return trimmed;
}

function buildDisplayCoverUrl({
  coverUrl,
  coverSource,
  artistSlug,
  slug,
  goIndexBase,
  coverVersion,
  context = "[cover_display]",
}: {
  coverUrl?: string | null;
  coverSource?: CoverSource | string | null;
  artistSlug: string;
  slug: string;
  goIndexBase: string;
  coverVersion?: number | null;
  context?: string;
}): string {
  const resolvedCoverUrl = resolvePreferredCoverUrl({
    coverUrl,
    coverSource,
    artistSlug,
    slug,
    goIndexBase,
    context,
  });

  const withVersion = buildCoverUrlWithVersion(resolvedCoverUrl, coverVersion ?? null);

  return withVersion ?? COVER_PLACEHOLDER_DATA_URL;
}

function renderMedia({
  src,
  alt,
  className,
  fallbackLabel = "NO COVER",
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}): string {
  const classes = ["media", className?.trim() || ""].filter(Boolean).join(" ");
  const imageMarkup = src
    ? `<img class="media__img is-loading" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />`
    : "";

  const fallbackAttribute = src ? "" : 'data-has-src="false"';

  return `
    <div class="${classes}" ${fallbackAttribute}>
      <div class="media__skeleton" aria-hidden="true"></div>
      <div class="media__fallback" role="img" aria-label="${escapeHtml(fallbackLabel)}">${escapeHtml(fallbackLabel)}</div>
      ${imageMarkup}
    </div>
  `;
}

function htmlPage(
  body: string,
  {
    title = "SREDA go",
    backgroundImage,
    pageClass,
  }: { title?: string; backgroundImage?: string | null; pageClass?: string | null } = {},
): string {
  const backgroundStyle = backgroundImage
    ? "--page-bg-image: none; --page-bg-opacity: 0.32;"
    : "--page-bg-image: none; --page-bg-opacity: 0;";
  const backgroundAttribute = backgroundImage ? `data-bg-image="${escapeHtml(backgroundImage)}"` : "";
  const poweredLogo = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 1500" role="img" aria-label="SREDA logo">
      <polygon fill="currentColor" points="504.67 149.25 802.96 560.18 654.86 750 805.04 900.19 204.29 1350.75 354.48 900.19 204.29 750 504.67 149.25"/>
      <g fill="currentColor">
        <path d="M622.08,1248.19h-54.74c-1.89-9.12-13.84-17.93-27.06-17.93s-21.71,3.78-21.71,11.96c0,24.54,105.39-.32,105.39,58.52,0,28.94-30.2,50.02-79.28,50.02-39.95,0-76.13-19.51-86.51-51.6v-9.75h54.74c3.46,11.33,16.99,18.88,30.2,18.88,15.42,0,23.91-5.66,23.91-12.27,0-19.19-104.13,1.57-104.13-58.2,0-28.31,31.46-51.91,76.76-51.91s72.99,22.97,82.43,52.54v9.75Z"/>
        <path d="M653.54,1189.67h52.85v16.36c11.64-12.58,28-20.13,46.88-20.13v54.74c-4.09-.94-11.01-1.57-16.04-1.57-14.16,0-27.37,7.55-30.83,21.39v86.51h-52.85v-157.3Z"/>
        <path d="M942.96,1287.83v10.07c-9.75,29.89-42.79,52.85-85.57,52.85-50.02,0-86.83-32.09-86.83-82.43s36.81-82.43,86.83-82.43c47.19,0,81.17,28.31,85.57,69.84v19.51h-118.6c2.52,17.3,15.1,27.68,33.03,27.68,12.9,0,24.22-4.72,30.2-15.1h55.37ZM827.51,1247.24h59.77c-5.35-11.01-15.1-17.3-29.89-17.3-13.84,0-24.54,6.29-29.89,17.3Z"/>
        <path d="M1135.49,1346.97h-52.85v-14.79c-12.27,11.96-28.31,18.56-46.88,18.56-40.58,0-70.16-32.09-70.16-82.43s29.57-82.43,70.16-82.43c18.56,0,34.61,6.92,46.88,18.88v-78.02h52.85v220.22ZM1019.09,1268.32c0,20.45,12.9,32.72,32.72,32.72s32.72-12.27,32.72-32.72-12.9-32.72-32.72-32.72-32.72,12.27-32.72,32.72Z"/>
        <path d="M1336.83,1346.97h-52.85v-14.79c-12.27,11.96-28.31,18.56-46.88,18.56-40.58,0-70.16-32.09-70.16-82.43s29.57-82.43,70.16-82.43c18.56,0,34.61,6.92,46.88,18.88v-15.1h52.85v157.3ZM1285.86,1268.32c0-20.45-12.9-32.72-32.72-32.72s-32.72,12.27-32.72,32.72,12.9,32.72,32.72,32.72,32.72-12.27,32.72-32.72Z"/>
      </g>
    </svg>
  `;
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html { height: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      position: relative;
      overflow-x: hidden;
      overflow-y: auto;
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
      opacity: 0;
      transform: scale(1.04);
      transition: opacity 260ms ease;
    }
    body.bg-ready::after { opacity: var(--page-bg-opacity, 0); }
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
      width: min(960px, calc(100% - 24px));
      background: ${THEME.colors.surface};
      border: 1px solid ${THEME.colors.borderSubtle};
      border-radius: ${THEME.radii.glass};
      box-shadow: ${THEME.shadows.card};
      padding: 1.5rem;
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

    /* ==================== Home page ==================== */
    body.page-home { align-items: center; padding-top: 3.6rem; padding-bottom: 3.6rem; }
    body.page-home .card { width: min(980px, calc(100% - 24px)); padding: 2.05rem; }
    .home { display: flex; flex-direction: column; gap: 1.45rem; position: relative; }
    .home::before {
      content: "";
      position: absolute;
      inset: -80px -80px auto auto;
      width: 520px;
      height: 520px;
      background: radial-gradient(circle at 35% 35%, rgba(245,158,11,0.28), transparent 60%),
                  radial-gradient(circle at 55% 55%, rgba(255,255,255,0.08), transparent 58%);
      filter: blur(18px);
      opacity: 0.9;
      pointer-events: none;
      z-index: 0;
    }
    .home > * { position: relative; z-index: 1; }
    .home-hero { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 1.25rem; align-items: start; }
    .home-top { display: flex; flex-direction: column; gap: 0.85rem; max-width: 720px; text-align: left; }
    .home-visual {
      width: 250px;
      height: 250px;
      border-radius: 24px;
      border: 1px solid ${THEME.colors.borderSubtle};
      background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015));
      box-shadow: 0 18px 46px rgba(0,0,0,0.38);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      overflow: hidden;
      position: relative;
    }
    .home-visual::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 40% 30%, rgba(245,158,11,0.26), transparent 55%),
                  radial-gradient(circle at 70% 65%, rgba(255,255,255,0.06), transparent 60%);
      opacity: 0.95;
      pointer-events: none;
    }
    .home-visual svg { position: relative; z-index: 1; display: block; }
    .home-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      width: fit-content;
      padding: 0.25rem 0.75rem;
      border-radius: ${THEME.radii.pill};
      border: 1px solid ${THEME.colors.borderSubtle};
      background: rgba(255,255,255,0.04);
      color: ${THEME.colors.textSecondary};
      font-weight: 760;
      letter-spacing: 0.02em;
      font-size: 0.92rem;
    }
    .home-badge::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: ${THEME.colors.accent}; box-shadow: 0 0 0 4px rgba(245,158,11,0.09); }
    .home-title { font-size: 2.55rem; line-height: 1.1; letter-spacing: 0.012em; margin: 0; }
    .home-lead { font-size: 1.08rem; color: ${THEME.colors.textSecondary}; max-width: 58ch; }
    .home-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.25rem; }
    .home-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      min-height: 46px;
      padding: 0.75rem 1.05rem;
      border-radius: 14px;
      border: 1px solid ${THEME.colors.borderSubtle};
      font-weight: 820;
      letter-spacing: 0.01em;
      transition: transform 120ms ease, box-shadow 160ms ease, border-color 140ms ease, background 140ms ease;
      white-space: nowrap;
    }
    .home-action:focus-visible { outline: 2px solid rgba(245,158,11,0.5); outline-offset: 3px; }
    .home-action--primary { background: linear-gradient(125deg, rgba(245,158,11,0.95), rgba(251,191,36,0.92)); color: #0b0b0b; box-shadow: 0 10px 22px rgba(0,0,0,0.28), 0 0 0 1px rgba(245,158,11,0.18); }
    .home-action--secondary { background: rgba(255,255,255,0.035); color: ${THEME.colors.textPrimary}; border-color: rgba(255,255,255,0.10); }
    .home-action:hover { transform: translateY(-1px); border-color: rgba(245,158,11,0.45); box-shadow: 0 14px 30px rgba(0,0,0,0.34); }
    .home-action:active { transform: translateY(0); box-shadow: 0 10px 22px rgba(0,0,0,0.28); }
    .home-inline { color: ${THEME.colors.textPrimary}; border-bottom: 1px solid transparent; transition: color 120ms ease, border-color 120ms ease; }
    .home-inline:hover { color: ${THEME.colors.accent}; border-bottom-color: ${THEME.colors.accent}; }
    .home-features { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.9rem; margin-top: 0.25rem; }
    .home-feature {
      display: grid;
      grid-template-columns: 40px 1fr;
      gap: 0.85rem;
      padding: 1.05rem 1.1rem;
      border-radius: 16px;
      border: 1px solid ${THEME.colors.borderSubtle};
      background: linear-gradient(180deg, rgba(30,30,30,0.62), rgba(24,24,24,0.54));
      box-shadow: ${THEME.shadows.gridCard};
      transition: transform 130ms ease, border-color 140ms ease, box-shadow 160ms ease;
    }
    .home-feature:hover { transform: translateY(-2px); border-color: rgba(245,158,11,0.34); box-shadow: 0 18px 44px rgba(0,0,0,0.42); }
    .home-feature-icon {
      width: 40px;
      height: 40px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.04);
      display: grid;
      place-items: center;
      color: ${THEME.colors.textPrimary};
      font-weight: 900;
      letter-spacing: 0.02em;
      box-shadow: 0 10px 18px rgba(0,0,0,0.22);
      position: relative;
      overflow: hidden;
    }
    .home-feature-icon::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 35% 30%, rgba(245,158,11,0.28), transparent 60%);
      opacity: 0.9;
    }
    .home-feature-icon > span { position: relative; z-index: 1; }
    .home-feature-title { font-weight: 850; letter-spacing: 0.01em; margin-bottom: 0.3rem; color: ${THEME.colors.textPrimary}; }
    .home-feature-text { color: ${THEME.colors.textSecondary}; line-height: 1.55; }
    .home-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.6rem; color: ${THEME.colors.textMuted}; font-size: 0.92rem; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 1rem; margin-top: 0.3rem; }
    
    /* Smartlink Release Page */
    .smartlink-release { display: flex; flex-direction: column; align-items: center; gap: 1.25rem; max-width: 340px; margin: 0 auto; width: 100%; }
    .smartlink-release__cover { width: 100%; max-width: 260px; }
    .smartlink-release__cover .cover { width: 100%; max-width: 260px; max-height: 260px; border-radius: 14px; }
    .smartlink-release__info { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; text-align: center; width: 100%; }
    .smartlink-release__title { font-size: 1.5rem; font-weight: 820; margin: 0; color: ${THEME.colors.textPrimary}; line-height: 1.2; }
    .smartlink-release__artist { font-size: 0.95rem; }
    .smartlink-release__artist .artist-link { color: ${THEME.colors.textSecondary}; font-weight: 600; }
    .smartlink-release__artist .artist-link:hover { color: ${THEME.colors.accent}; }
    .smartlink-release__date { font-size: 0.85rem; color: ${THEME.colors.textMuted}; margin-top: 0.15rem; }
    .smartlink-release__links { display: flex; flex-direction: column; gap: 0.5rem; width: 100%; max-width: 300px; }
    .smartlink-release__links .link-btn { justify-content: center; padding: 0.7rem 1rem; font-size: 0.95rem; border-radius: 10px; }
    .smartlink-release__links .link-btn::after { display: none; }
    .smartlink-release__empty { color: ${THEME.colors.textMuted}; text-align: center; padding: 1rem; }
    .smartlink-release__share { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; width: 100%; margin-top: 0.25rem; }
    .share-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; padding: 0.5rem 1rem; border: 1px solid ${THEME.colors.borderSubtle}; border-radius: 8px; background: rgba(255,255,255,0.04); color: ${THEME.colors.textSecondary}; font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: all 140ms ease; }
    .share-btn:hover { background: rgba(255,255,255,0.08); color: ${THEME.colors.textPrimary}; border-color: ${THEME.colors.accent}; }
    .share-btn.copied { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.4); color: #22c55e; }
    .share-btn svg { width: 14px; height: 14px; flex-shrink: 0; }
    .smartlink-release .copy-toast { text-align: center; font-size: 0.85rem; }
    
    /* Legacy styles for backward compatibility */
    .release-grid { display: grid; grid-template-columns: minmax(300px, 360px) minmax(420px, 520px); gap: 1.35rem; align-items: start; justify-content: center; min-width: 0; }
    .cover-wrap { display: flex; justify-content: center; align-items: flex-start; width: 100%; align-self: stretch; min-width: 0; }
    .content-wrap { display: flex; flex-direction: column; gap: 0.75rem; width: min(520px, 100%); max-width: 520px; min-width: 0; }
    .cover {
      width: min(100%, 380px);
      max-width: 420px;
      max-height: 420px;
      aspect-ratio: 1 / 1;
      height: auto;
      border-radius: ${THEME.radii.cover};
      border: 1px solid ${THEME.colors.borderSubtle};
      background: ${THEME.colors.surfaceStrong};
      box-shadow: ${THEME.shadows.cover};
      display: block;
      overflow: hidden;
      position: relative;
    }
    .media {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
      border-radius: inherit;
      overflow: hidden;
      background: ${THEME.colors.surfaceMuted};
      isolation: isolate;
    }
    .media__img,
    .media__skeleton,
    .media__fallback {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border-radius: inherit;
    }
    .media__img {
      object-fit: cover;
      width: 100%;
      height: 100%;
      opacity: 0;
      filter: blur(10px);
      transition: opacity 260ms ease, filter 320ms ease;
      background: transparent;
    }
    .media__skeleton {
      background: linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.1), rgba(255,255,255,0.05));
      background-size: 200% 100%;
      animation: shimmer 1.4s ease-in-out infinite;
    }
    .media__fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${THEME.colors.surfaceStrong};
      color: ${THEME.colors.textMuted};
      font-weight: 760;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0;
      visibility: hidden;
      transition: opacity 180ms ease;
    }
    .media--ready .media__img { opacity: 1; filter: blur(0); }
    .media--ready .media__skeleton { opacity: 0; visibility: hidden; }
    .media--error .media__fallback { opacity: 1; visibility: visible; }
    .media--error .media__skeleton { opacity: 0; visibility: hidden; }
    .media[data-has-src="false"] .media__skeleton { opacity: 0; visibility: hidden; }
    .media[data-has-src="false"] .media__fallback { opacity: 1; visibility: visible; }
    .release-grid .media__fallback { font-size: 0.98rem; }
    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .reduce-motion .media__skeleton { animation: none; background-position: center; }
    a { color: inherit; text-decoration: none; }
    h1 { margin: 0; font-size: 2rem; letter-spacing: 0.01em; color: ${THEME.colors.textPrimary}; font-weight: 820; }
    p { margin: 0; color: ${THEME.colors.textSecondary}; line-height: 1.5; }
    .meta { color: ${THEME.colors.textSecondary}; font-size: 0.98rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; min-width: 0; }
    .meta strong { color: ${THEME.colors.textPrimary}; }
    .meta-label { color: ${THEME.colors.textSecondary}; }
    .meta-divider { color: ${THEME.colors.textMuted}; }
    .header { display: flex; flex-direction: column; gap: 0.55rem; min-width: 0; width: 100%; }
    .artist-line { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 1rem; justify-content: flex-start; }
    .artist-line .meta-label { color: ${THEME.colors.textMuted}; }
    .release-date { color: ${THEME.colors.textMuted}; font-size: 0.9rem; margin: 0; text-align: left; opacity: 0.78; }
    .artist-link { color: ${THEME.colors.textPrimary}; text-decoration: none; border-bottom: 1px solid transparent; transition: color 120ms ease, border-color 120ms ease; }
    .artist-link:hover { color: ${THEME.colors.accent}; border-bottom-color: ${THEME.colors.accent}; }
    .links-grid { margin-top: 0.5rem; display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
    .links-grid.links-grid--single { grid-template-columns: 1fr; }
    .links-grid .link-btn:last-child:nth-child(odd) { grid-column: 1 / -1; }
    .link-btn {
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.55rem;
      padding: 0.7rem 0.9rem;
      min-height: 44px;
      width: 100%;
      border-radius: 12px;
      border: 1px solid ${THEME.colors.borderSubtle};
      background: ${THEME.colors.surfaceMuted};
      color: ${THEME.colors.textPrimary};
      font-weight: 760;
      letter-spacing: 0.01em;
      box-shadow: 0 8px 20px rgba(0,0,0,0.26);
      transition: border-color 140ms ease, background 140ms ease, color 140ms ease, transform 120ms ease, box-shadow 150ms ease;
    }
    .link-btn::after { content: ""; width: 7px; height: 7px; border-radius: 50%; background: ${THEME.colors.accent}; opacity: 0.9; box-shadow: 0 0 0 3px rgba(245,158,11,0.09); }
    .link-btn:hover { border-color: ${THEME.colors.accent}; background: rgba(46,46,46,0.8); color: ${THEME.colors.textPrimary}; transform: translateY(-1px); box-shadow: 0 12px 28px rgba(0,0,0,0.34); }
    .link-btn:active { transform: translateY(0); border-color: ${THEME.colors.accent}; }
    .small { margin-top: 2rem; font-size: 0.95rem; color: ${THEME.colors.textMuted}; }
    .canonical-row { display: flex; flex-direction: column; align-items: stretch; gap: 0.35rem; color: ${THEME.colors.textSecondary}; font-size: 0.95rem; padding: 0; border-radius: 0; border: none; background: transparent; width: 100%; min-width: 0; margin-top: 1rem; }
    .copy-btn { border: none; background: linear-gradient(125deg, rgba(245,158,11,0.95), rgba(251,191,36,0.92)); color: #0b0b0b; border-radius: 12px; width: 100%; padding: 0.7rem 0.95rem; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; cursor: pointer; font-weight: 790; letter-spacing: 0.005em; transition: background 140ms ease, color 140ms ease, box-shadow 150ms ease, transform 120ms ease; box-shadow: 0 10px 22px rgba(0,0,0,0.28), 0 0 0 1px rgba(245,158,11,0.18); }
    .copy-btn:hover { background: linear-gradient(125deg, rgba(251,191,36,0.98), rgba(245,158,11,0.95)); color: #0a0a0a; box-shadow: 0 12px 26px rgba(0,0,0,0.3), 0 0 0 1px rgba(245,158,11,0.22); transform: translateY(-1px); }
    .copy-btn:active { background: linear-gradient(125deg, rgba(245,158,11,0.98), rgba(245,158,11,0.95)); box-shadow: 0 8px 18px rgba(0,0,0,0.26), 0 0 0 1px rgba(245,158,11,0.26); transform: translateY(0); }
    .copy-btn.copied { background: rgba(34, 197, 94, 0.25); border-color: rgba(34, 197, 94, 0.5); box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.4); color: #22c55e; }
    .copy-btn:focus-visible { outline: 2px solid rgba(245,158,11,0.5); outline-offset: 3px; }
    .copy-btn__icon { width: 16px; height: 16px; display: block; flex: 0 0 auto; }
    .copy-toast { min-width: 80px; color: ${THEME.colors.accent}; opacity: 0; transform: translateY(4px); transition: opacity 180ms ease, transform 180ms ease; font-weight: 760; font-size: 0.9rem; text-align: left; }
    .copy-toast.visible { opacity: 1; transform: translateY(0); }
    .smartlink-footer .copy-toast { grid-column: 1 / -1; font-size: 0.85rem; }
    .copy-toast--floating {
      position: absolute;
      right: 12px;
      bottom: 54px;
      min-width: 0;
      padding: 0.35rem 0.6rem;
      border-radius: ${THEME.radii.pill};
      border: 1px solid ${THEME.colors.borderSubtle};
      background: rgba(18,18,18,0.78);
      color: ${THEME.colors.textPrimary};
      font-size: 0.82rem;
      font-weight: 760;
      letter-spacing: 0.01em;
      pointer-events: none;
      backdrop-filter: blur(14px) saturate(1.1);
      -webkit-backdrop-filter: blur(14px) saturate(1.1);
      box-shadow: 0 10px 24px rgba(0,0,0,0.35);
    }
    .smartlink-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.9rem; margin-top: 0.6rem; align-items: stretch; }
    .smartlink-item { display: flex; flex-direction: column; gap: 0.55rem; padding: 0.95rem 1rem; border-radius: 16px; border: 1px solid ${THEME.colors.borderSubtle}; background: rgba(30,30,30,0.62); cursor: pointer; transition: border-color 140ms ease, transform 120ms ease, background 140ms ease, box-shadow 150ms ease; box-shadow: ${THEME.shadows.gridCard}; }
    .smartlink-item:focus-visible { outline: 2px solid ${THEME.colors.accent}; outline-offset: 2px; }
    .smartlink-item:hover { border-color: ${THEME.colors.accent}; background: rgba(38,38,38,0.82); transform: translateY(-2px); box-shadow: 0 14px 34px rgba(0,0,0,0.35); }
    .smartlink-item:active { transform: translateY(0); }
    .smartlink-main { display: grid; grid-template-columns: auto 1fr; gap: 0.85rem; align-items: center; color: inherit; text-decoration: none; }
    .smartlink-cover { width: 76px; height: 76px; aspect-ratio: 1 / 1; border-radius: 12px; border: 1px solid ${THEME.colors.borderSubtle}; background: ${THEME.colors.surface}; box-shadow: ${THEME.shadows.cover}; overflow: hidden; position: relative; }
    .smartlink-content { display: flex; flex-direction: column; gap: 0.25rem; }
    .smartlink-title-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .smartlink-title { font-size: 1.02rem; font-weight: 820; letter-spacing: 0.01em; color: ${THEME.colors.textPrimary}; }
    .platform-chip { display: inline-flex; align-items: center; justify-content: center; padding: 0.18rem 0.55rem; border-radius: ${THEME.radii.pill}; background: rgba(46,46,46,0.55); border: 1px solid ${THEME.colors.borderSubtle}; color: ${THEME.colors.textSecondary}; font-weight: 740; font-size: 0.82rem; min-width: 2rem; text-align: center; gap: 0.3rem; }
    .platform-chip::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: ${THEME.colors.accent}; box-shadow: 0 0 0 3px rgba(245,158,11,0.08); }
    .meta-row { display: flex; flex-wrap: wrap; gap: 0.35rem 0.65rem; align-items: center; color: ${THEME.colors.textSecondary}; font-size: 0.9rem; }
    .meta-row.subtle { color: ${THEME.colors.textMuted}; font-size: 0.86rem; }
    .meta-dot { width: 4px; height: 4px; border-radius: 50%; background: ${THEME.colors.textFaint}; display: inline-block; }
    .pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.7rem; border-radius: ${THEME.radii.pill}; background: ${THEME.colors.surface}; border: 1px solid ${THEME.colors.border}; color: ${THEME.colors.textSecondary}; font-weight: 700; }
    .pill-soft { background: ${THEME.colors.surfaceMuted}; color: ${THEME.colors.textSecondary}; border-color: ${THEME.colors.border}; }
    .artist-hero {
      position: relative;
      width: calc(100% + 3rem);
      margin: -1.5rem -1.5rem 1.25rem -1.5rem;
      border-radius: 20px 20px 0 0;
      overflow: hidden;
      aspect-ratio: 16 / 9;
      max-height: 280px;
      background: linear-gradient(180deg, rgba(30,30,30,0.6), rgba(18,18,18,0.95));
    }
    .artist-hero__img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center 25%;
    }
    .artist-hero__overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.45) 60%, rgba(18,18,18,0.92) 100%);
      pointer-events: none;
    }
    .artist-hero__content {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 1.5rem;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .artist-hero__info { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
    .artist-name { color: #FFFFFF; font-size: 2.2rem; font-weight: 850; letter-spacing: 0.015em; text-shadow: 0 2px 12px rgba(0,0,0,0.5); }
    .artist-meta { color: rgba(255,255,255,0.75); font-size: 0.95rem; display: inline-flex; align-items: center; gap: 0.35rem; }
    .artist-actions { display: inline-flex; align-items: center; gap: 0.55rem; }
    .smartlink-item--release { gap: 0.35rem; position: relative; padding-bottom: 1.25rem; }
    .smartlink-item--release .smartlink-main { align-items: flex-start; }
    .smartlink-item--release .smartlink-cover { width: 84px; height: 84px; }
    .smartlink-item--release .smartlink-title { font-size: 1.05rem; }
    .smartlink-item--release .meta-row { margin-top: 0.15rem; }
    .smartlink-item__copy { position: absolute; right: 12px; bottom: 12px; z-index: 2; }
    .smartlink-footer { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 0.5rem; }
    .copy-btn--ghost { background: rgba(255,255,255,0.04); color: ${THEME.colors.textSecondary}; box-shadow: none; border: 1px solid ${THEME.colors.borderSubtle}; padding: 0.5rem 0.65rem; min-height: 0; font-size: 0.92rem; font-weight: 760; width: auto; }
    .copy-btn--ghost:hover { background: rgba(255,255,255,0.08); color: ${THEME.colors.textPrimary}; box-shadow: 0 8px 18px rgba(0,0,0,0.26); }
    .copy-btn--ghost:active { background: rgba(255,255,255,0.06); box-shadow: none; }
    .copy-btn--icon { width: auto; min-height: 0; padding: 0.45rem 0.55rem; border-radius: 12px; background: rgba(255,255,255,0.04); color: ${THEME.colors.textSecondary}; box-shadow: none; border: 1px solid ${THEME.colors.borderSubtle}; }
    .copy-btn--icon:hover { background: rgba(255,255,255,0.08); color: ${THEME.colors.textPrimary}; box-shadow: 0 8px 18px rgba(0,0,0,0.22); }
    .copy-btn--icon:active { background: rgba(255,255,255,0.06); box-shadow: none; }
    .empty-state { padding: 1.4rem; border-radius: 12px; border: 1px dashed ${THEME.colors.border}; background: ${THEME.colors.surfaceMuted}; color: ${THEME.colors.textSecondary}; }
    .powered-by {
      display: flex;
      justify-content: center;
      margin-top: 0.9rem;
    }
    .powered-by__stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 0.6rem;
      width: fit-content;
    }
    .powered-by__text {
      color: ${THEME.colors.textMuted};
      font-size: 0.85rem;
      letter-spacing: 0.01em;
      white-space: nowrap;
    }
    .powered-by__text strong { color: ${THEME.colors.textSecondary}; font-weight: 860; }
    .powered-by__logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.92);
      opacity: 0.92;
      transition: opacity 140ms ease, transform 120ms ease;
      width: 50%;
      max-width: 92px;
    }
    .powered-by__logo:hover { opacity: 1; transform: translateY(-1px); }
    .powered-by__logo:active { transform: translateY(0); }
    .powered-by__logo svg { width: 100%; height: auto; display: block; }
    @media (max-width: 1024px) {
      .smartlink-list { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    }
    @media (max-width: 1100px) {
      .links-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 768px) {
      .release-grid { grid-template-columns: 1fr; justify-items: stretch; }
      .release-grid .header { text-align: center; width: 100%; align-items: center; }
      .release-grid .links-grid { width: 100%; }
      .artist-line { justify-content: center; }
      .release-date { text-align: center; }
      .canonical-row { align-items: center; }
      .links-grid { grid-template-columns: 1fr; }
      .smartlink-footer { grid-template-columns: 1fr; }
      .home-top { text-align: center; align-items: center; }
      .home-badge { margin: 0 auto; }
      .home-actions { justify-content: center; }
      .home-features { grid-template-columns: 1fr; }
      .home-footer { justify-content: center; }
      .home-hero { grid-template-columns: 1fr; justify-items: center; }
      .home-visual { width: min(260px, 100%); height: auto; aspect-ratio: 1 / 1; }
    }
    @media (max-width: 640px) {
      body { padding: 1.25rem; }
      .card { padding: 1.4rem; width: calc(100% - 16px); }
      h1 { font-size: 1.5rem; }
      .cover { max-width: min(92vw, 420px); }
      .smartlink-main { grid-template-columns: 1fr; }
      .smartlink-cover { width: 100%; height: auto; max-height: 240px; aspect-ratio: 1 / 1; }
      .smartlink-title-row { align-items: flex-start; }
      .links-grid { grid-template-columns: 1fr; }
      .smartlink-list { grid-template-columns: 1fr; gap: 0.65rem; }
      .smartlink-item { padding: 0.85rem; }
      /* Release cards: horizontal layout on mobile */
      .smartlink-item--release { padding: 0.7rem; padding-right: 3rem; }
      .smartlink-item--release .smartlink-main { grid-template-columns: auto 1fr; align-items: center; gap: 0.65rem; }
      .smartlink-item--release .smartlink-cover { width: 56px; height: 56px; }
      .smartlink-item--release .smartlink-content { min-width: 0; }
      .smartlink-item--release .smartlink-title { font-size: 0.92rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .smartlink-item--release .meta-row { font-size: 0.78rem; }
      .smartlink-item--release .smartlink-item__copy { top: 50%; bottom: auto; transform: translateY(-50%); right: 0.6rem; }
      .copy-toast--floating { bottom: 45px; right: 8px; font-size: 0.75rem; padding: 0.3rem 0.5rem; }
      .copy-btn:not(.copy-btn--ghost):not(.copy-btn--icon) { width: 100%; }
      /* Smartlink release page mobile */
      .smartlink-release { gap: 1.1rem; max-width: 100%; }
      .smartlink-release__cover { max-width: 240px; }
      .smartlink-release__cover .cover { max-width: 240px; max-height: 240px; }
      .smartlink-release__links { max-width: 100%; }
    }
    @media (max-width: 480px) {
      body { padding: 1rem 0.85rem; }
      .card { padding: 1.1rem; width: calc(100% - 12px); }
      .release-grid { gap: 1rem; }
      .canonical-row { align-items: center; gap: 0.5rem; }
      .smartlink-list { gap: 0.55rem; }
      .smartlink-item { padding: 0.7rem; border-radius: 14px; }
      .smartlink-item--release .smartlink-cover { width: 52px; height: 52px; border-radius: 10px; }
      .smartlink-item--release .smartlink-title { font-size: 0.9rem; }
      .smartlink-item--release .meta-row { font-size: 0.75rem; gap: 0.25rem; }
      .artist-hero { max-height: 200px; margin: -1.1rem -1.1rem 1rem -1.1rem; width: calc(100% + 2.2rem); }
      .artist-name { font-size: 1.5rem; }
      .artist-meta { font-size: 0.82rem; }
      .copy-btn--ghost { padding: 0.35rem 0.5rem; font-size: 0.82rem; }
      /* Smartlink release page small mobile */
      .smartlink-release { gap: 1rem; }
      .smartlink-release__cover { max-width: 220px; }
      .smartlink-release__cover .cover { max-width: 220px; max-height: 220px; }
      .smartlink-release__title { font-size: 1.3rem; }
      .smartlink-release__artist { font-size: 0.9rem; }
      .smartlink-release__links .link-btn { padding: 0.65rem 0.9rem; font-size: 0.92rem; }
    }
  </style>
</head>
<body class="${escapeHtml(pageClass || "")}" style="${backgroundStyle}" ${backgroundAttribute}>
  <div class="noise-layer"></div>
  <main class="card release-card">
    ${body}
  </main>
  <footer class="powered-by" aria-label="powered by SREDA">
    <div class="powered-by__stack">
      <div class="powered-by__text">powered by <strong>SREDA</strong></div>
      <a class="powered-by__logo" href="/" aria-label="SREDA">
        ${poweredLogo}
      </a>
    </div>
  </footer>
  <script>
    (function() {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (prefersReducedMotion.matches) {
        document.documentElement.classList.add('reduce-motion');
      }

      function revealImage(media) {
        media.classList.add('media--ready');
        media.classList.remove('media--loading');
        const img = media.querySelector('.media__img');
        if (img) {
          img.classList.remove('is-loading');
        }
      }

      function showFallback(media) {
        media.classList.add('media--error');
        media.classList.remove('media--loading');
        const img = media.querySelector('.media__img');
        if (img) {
          img.classList.remove('is-loading');
        }
      }

      document.querySelectorAll('.media').forEach((media) => {
        const img = media.querySelector('img.media__img');
        if (!img || !img.getAttribute('src')) {
          showFallback(media);
          return;
        }

        media.classList.add('media--loading');

        const handleLoad = async () => {
          try {
            if (img.decode) {
              await img.decode();
            }
          } catch (error) {
            console.warn('image decode skipped', error);
          }
          revealImage(media);
        };

        const handleError = () => {
          showFallback(media);
        };

        if (img.complete) {
          if (img.naturalWidth > 0) {
            handleLoad();
          } else {
            handleError();
          }
        } else {
          img.addEventListener('load', handleLoad, { once: true });
          img.addEventListener('error', handleError, { once: true });
        }
      });

      const bgImage = document.body.getAttribute('data-bg-image');
      if (bgImage) {
        const loader = new Image();
        loader.onload = () => {
          // не использовать backticks внутри HTML template literal, ломает сборку
          document.body.style.setProperty(
            '--page-bg-image',
            'url("' + bgImage.replace(/"/g, '\\"') + '")',
          );
          document.body.classList.add('bg-ready');
        };
        loader.onerror = () => {
          document.body.style.setProperty('--page-bg-opacity', '0');
        };
        loader.src = bgImage;
      }
    })();
  </script>
</body>
</html>`;
}

function renderHome(): Response {
  const telegramUrl = "https://t.me/iskramusic_bot";
  const demoArtist = "/artist/boris";
  const demoSmartlink = "/boris/heavy-rain";
  const body = `
    <section class="home">
      <div class="home-hero">
        <div class="home-top">
          <div class="home-badge">SREDA · tools for artists</div>
          <h1 class="home-title">Инструменты для артистов</h1>
          <p class="home-lead">
            Релиз‑план, смартлинки, напоминания, кабинеты артиста и питчинг — в одном месте.
          </p>
          <div class="home-actions">
            <a class="home-action home-action--primary" href="${escapeHtml(telegramUrl)}" target="_blank" rel="noopener noreferrer">
              Открыть ИСКРУ в Telegram
            </a>
            <a class="home-action home-action--secondary" href="${escapeHtml(demoArtist)}">
              Открыть смартлинки (пример)
            </a>
          </div>
        </div>
        <div class="home-visual" aria-hidden="true">
          <!-- Official SREDA logo (from provided SVG) -->
          <svg width="140" height="140" viewBox="160 120 1240 1260" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
            <defs>
              <filter id="logoShadow" x="-30%" y="-20%" width="160%" height="160%">
                <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="rgba(0,0,0,0.45)"/>
              </filter>
            </defs>
            <g filter="url(#logoShadow)">
              <polygon fill="#F9A600" points="504.67 149.25 802.96 560.18 654.86 750 805.04 900.19 204.29 1350.75 354.48 900.19 204.29 750 504.67 149.25"/>
              <g fill="#FFFFFF" opacity="0.92">
                <path d="M622.08,1248.19h-54.74c-1.89-9.12-13.84-17.93-27.06-17.93s-21.71,3.78-21.71,11.96c0,24.54,105.39-.32,105.39,58.52,0,28.94-30.2,50.02-79.28,50.02-39.95,0-76.13-19.51-86.51-51.6v-9.75h54.74c3.46,11.33,16.99,18.88,30.2,18.88,15.42,0,23.91-5.66,23.91-12.27,0-19.19-104.13,1.57-104.13-58.2,0-28.31,31.46-51.91,76.76-51.91s72.99,22.97,82.43,52.54v9.75Z"/>
                <path d="M653.54,1189.67h52.85v16.36c11.64-12.58,28-20.13,46.88-20.13v54.74c-4.09-.94-11.01-1.57-16.04-1.57-14.16,0-27.37,7.55-30.83,21.39v86.51h-52.85v-157.3Z"/>
                <path d="M942.96,1287.83v10.07c-9.75,29.89-42.79,52.85-85.57,52.85-50.02,0-86.83-32.09-86.83-82.43s36.81-82.43,86.83-82.43c47.19,0,81.17,28.31,85.57,69.84v19.51h-118.6c2.52,17.3,15.1,27.68,33.03,27.68,12.9,0,24.22-4.72,30.2-15.1h55.37ZM827.51,1247.24h59.77c-5.35-11.01-15.1-17.3-29.89-17.3-13.84,0-24.54,6.29-29.89,17.3Z"/>
                <path d="M1135.49,1346.97h-52.85v-14.79c-12.27,11.96-28.31,18.56-46.88,18.56-40.58,0-70.16-32.09-70.16-82.43s29.57-82.43,70.16-82.43c18.56,0,34.61,6.92,46.88,18.88v-78.02h52.85v220.22ZM1019.09,1268.32c0,20.45,12.9,32.72,32.72,32.72s32.72-12.27,32.72-32.72-12.9-32.72-32.72-32.72-32.72,12.27-32.72,32.72Z"/>
                <path d="M1336.83,1346.97h-52.85v-14.79c-12.27,11.96-28.31,18.56-46.88,18.56-40.58,0-70.16-32.09-70.16-82.43s29.57-82.43,70.16-82.43c18.56,0,34.61,6.92,46.88,18.88v-15.1h52.85v157.3ZM1285.86,1268.32c0-20.45-12.9-32.72-32.72-32.72s-32.72,12.27-32.72,32.72,12.9,32.72,32.72,32.72,32.72-12.27,32.72-32.72Z"/>
              </g>
            </g>
          </svg>
        </div>
      </div>

      <div class="home-features" role="list">
        <div class="home-feature" role="listitem">
          <div class="home-feature-icon" aria-hidden="true"><span>⚡</span></div>
          <div>
            <div class="home-feature-title">Смартлинк за минуту</div>
            <div class="home-feature-text">Вставь ссылку на релиз — соберём площадки и сделаем аккуратную карточку.</div>
          </div>
        </div>
        <div class="home-feature" role="listitem">
          <div class="home-feature-icon" aria-hidden="true"><span>↗</span></div>
          <div>
            <div class="home-feature-title">Можно пересылать</div>
            <div class="home-feature-text">Карточка без “техкнопок”. Управление — отдельным меню только для владельца.</div>
          </div>
        </div>
        <div class="home-feature" role="listitem">
          <div class="home-feature-icon" aria-hidden="true"><span>🔔</span></div>
          <div>
            <div class="home-feature-title">Напоминания о релизе</div>
            <div class="home-feature-text">Поставь напоминания до и в день релиза — чтобы не забыть про промо.</div>
          </div>
        </div>
        <div class="home-feature" role="listitem">
          <div class="home-feature-icon" aria-hidden="true"><span>✏️</span></div>
          <div>
            <div class="home-feature-title">Редактирование после создания</div>
            <div class="home-feature-text">Меняй обложку и ссылки, обновляй карточку и удаляй смартлинки из бота.</div>
          </div>
        </div>
      </div>

      <div class="home-footer">
        <span>© SREDA</span>
        <span class="meta-divider">•</span>
        <a class="home-inline" href="${escapeHtml(telegramUrl)}" target="_blank" rel="noopener noreferrer">Telegram</a>
      </div>
    </section>
  `;
  return new Response(htmlPage(body, { title: "SREDA — tools for artists", pageClass: "page-home" }), {
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
    const linkIcon = `<svg class="copy-btn__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
      <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>`;

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
        artist_photo_url,
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
        artist_photo_url: string | null;
        updated_at: string | null;
      }>();

    const items = query.results ?? [];
    const displayArtistName =
      items.find((item) => item.artist_name?.trim())?.artist_name?.trim() || prettifySlug(artistSlug);
    const canonicalBase = goIndexBase.replace(/\/$/, "");
    const releaseCover = items
      .map((item) => {
        const coverSource = parseCoverSource(
          item.cover_source,
          `[artist ${artistSlug}/${item.slug}] cover_source bg`,
        );
        const coverVersion = normalizeCoverVersionInput(item.cover_version ?? null);
        const resolvedCoverUrl = resolvePreferredCoverUrl({
          coverUrl: item.cover_url,
          coverSource,
          artistSlug,
          slug: item.slug,
          goIndexBase,
          context: `[artist ${artistSlug}/${item.slug}] cover_display bg`,
        });
        return buildCoverUrlWithVersion(resolvedCoverUrl, coverVersion);
      })
      .find((url) => Boolean(url));

    // Use stored artist photo URL if available (populated by bot when creating smartlinks)
    const artistPhoto = items.find((item) => item.artist_photo_url?.trim())?.artist_photo_url?.trim() || null;

    // Use artist photo if available, otherwise fall back to release cover
    const heroImage = artistPhoto || releaseCover;
    const artistCanonicalUrl = `${canonicalBase}/artist/${encodeURIComponent(artistSlug)}`;

    const cards = items.map((record) => {
      const links = parseLinksFromJson(record.links_json, `[artist ${artistSlug}/${record.slug}] links`);
      const linkCount = Object.keys(links).length;
        const coverSource = parseCoverSource(record.cover_source, `[artist ${artistSlug}/${record.slug}] cover_source`);
        const coverVersion = normalizeCoverVersionInput(record.cover_version ?? null);
        const coverUrlWithVersion = buildDisplayCoverUrl({
          coverUrl: record.cover_url,
          coverSource,
          artistSlug,
          slug: record.slug,
          goIndexBase,
          coverVersion,
          context: `[artist ${artistSlug}/${record.slug}] cover_display`,
        });
      const canonicalUrl = `${canonicalBase}/${artistSlug}/${record.slug}`;
      const formattedReleaseDate = formatDisplayDate(record.release_date);
      const formattedUpdatedAt = formatDisplayDate(record.updated_at);
      const metaParts = [
        formattedReleaseDate ? escapeHtml(formattedReleaseDate) : null,
        linkCount
          ? (() => {
              const n = linkCount;
              const label =
                n % 10 === 1 && n % 100 !== 11
                  ? "площадка"
                  : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)
                    ? "площадки"
                    : "площадок";
              return `${n} ${label}`;
            })()
          : null,
        formattedUpdatedAt ? `Обновлено ${escapeHtml(formattedUpdatedAt)}` : null,
      ].filter(Boolean);
      const title = record.title ?? "Релиз";

      return `
        <article class="smartlink-item smartlink-item--release" data-href="${escapeHtml(canonicalUrl)}" tabindex="0" role="link">
          <button class="copy-btn copy-btn--icon smartlink-item__copy" type="button" data-url="${escapeHtml(canonicalUrl)}" aria-label="Скопировать ссылку на релиз" title="Скопировать ссылку">
            ${linkIcon}
          </button>
          <span class="copy-toast copy-toast--floating" role="status" aria-live="polite"></span>
          <a class="smartlink-main" href="${escapeHtml(canonicalUrl)}">
            ${renderMedia({ src: coverUrlWithVersion, alt: title, className: "smartlink-cover" })}
            <div class="smartlink-content">
              <div class="smartlink-title">${escapeHtml(title)}</div>
              <div class="meta-row subtle">${metaParts.join('<span class="meta-dot"></span>')}</div>
            </div>
          </a>
        </article>
      `;
    });

      const body = `
        <div class="artist-hero">
          ${heroImage ? `<img class="artist-hero__img" src="${escapeHtml(heroImage)}" alt="${escapeHtml(displayArtistName)}" />` : ""}
          <div class="artist-hero__overlay"></div>
          <div class="artist-hero__content">
            <div class="artist-hero__info">
              <h1 class="artist-name">${escapeHtml(displayArtistName)}</h1>
              <div class="artist-meta">
                <span>Релизы артиста</span>
              </div>
            </div>
            <div class="artist-actions">
              <button class="copy-btn copy-btn--ghost" type="button" data-url="${escapeHtml(artistCanonicalUrl)}" aria-label="Поделиться ссылкой на страницу артиста" title="Поделиться">
                ${linkIcon}
                <span>Поделиться</span>
              </button>
              <span class="copy-toast" role="status" aria-live="polite"></span>
            </div>
          </div>
        </div>
        ${
          cards.length
          ? `<div class="smartlink-list">${cards.join("\n")}</div>`
          : `<div class="empty-state">Для артиста пока нет смартлинков.</div>`
      }
      <script>
        (function() {
          async function copyOrShare(url, title) {
            if (!url) return { ok: false, shared: false };
            
            // Try Web Share API first (works on mobile and some desktop browsers)
            if (typeof navigator.share === 'function') {
              try {
                await navigator.share({ url: url, title: title || 'Поделиться' });
                return { ok: true, shared: true };
              } catch (e) {
                if (e.name === 'AbortError') return { ok: false, shared: true }; // User cancelled
                // Share failed, fall through to clipboard
              }
            }
            
            // Try clipboard API
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              try {
                await navigator.clipboard.writeText(url);
                return { ok: true, shared: false };
              } catch (e) {
                // Clipboard failed, fall through to execCommand
              }
            }
            
            // Fallback to execCommand
            try {
              const textarea = document.createElement('textarea');
              textarea.value = url;
              textarea.setAttribute('readonly', '');
              textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
              document.body.appendChild(textarea);
              textarea.focus();
              textarea.select();
              const ok = document.execCommand('copy');
              document.body.removeChild(textarea);
              return { ok: ok, shared: false };
            } catch (error) {
              return { ok: false, shared: false };
            }
          }

          function attachCopyHandlers() {
            document.querySelectorAll('.copy-btn[data-url]').forEach((button) => {
              const container = button.closest('.artist-actions') || button.parentElement;
              const toast = container?.querySelector('.copy-toast') || null;
              const card = button.closest('.smartlink-item');

              // Stop propagation on touch to prevent card activation
              button.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
              button.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });

              button.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                // Remove focus from card if present
                if (card) card.blur();
                
                const urlToCopy = button.getAttribute('data-url') || '';
                const cardTitle = container?.querySelector('.smartlink-title')?.textContent || '';
                const result = await copyOrShare(urlToCopy, cardTitle);
                
                // If shared via native dialog, no need for toast
                if (result.shared) return;
                
                const originalTitle = button.getAttribute('title') || '';

                if (toast) {
                  toast.textContent = result.ok ? 'Ссылка скопирована' : 'Не удалось скопировать';
                  toast.classList.add('visible');
                } else if (originalTitle) {
                  button.setAttribute('title', result.ok ? 'Ссылка скопирована' : 'Не удалось скопировать');
                }

                button.classList.toggle('copied', result.ok);

                window.setTimeout(() => {
                  button.classList.remove('copied');
                  toast?.classList.remove('visible');
                  if (!toast && originalTitle) {
                    button.setAttribute('title', originalTitle);
                  }
                }, result.ok ? 1500 : 1800);
              });
            });
          }

          attachCopyHandlers();

          document.querySelectorAll('.smartlink-item[data-href]').forEach((card) => {
            const href = card.getAttribute('data-href');
            if (!href) return;

            const navigate = () => {
              window.location.href = href;
            };

            card.addEventListener('click', (event) => {
              const target = event.target;
              if (target && target.closest && (target.closest('button') || target.closest('a'))) return;
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

    return new Response(htmlPage(body, { title: `${displayArtistName} — SREDA`, backgroundImage: heroImage || null }), {
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
  const releaseDate = formatDisplayDate(data.release_date);
  const coverVersion = normalizeCoverVersionInput(data.cover_version ?? null);
  const coverUrlWithVersion = buildDisplayCoverUrl({
    coverUrl: data.cover_url ?? null,
    coverSource: data.cover_source ?? null,
    artistSlug,
    slug,
    goIndexBase,
    coverVersion,
    context: `[render ${artistSlug}/${slug}] cover_source`,
  });

  if (coverUrlWithVersion === COVER_PLACEHOLDER_DATA_URL) {
    console.warn(`[render ${artistSlug}/${slug}]: missing cover, using placeholder`, {
      cover_url: data.cover_url ?? null,
      cover_source: data.cover_source ?? null,
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

  const linkCount = orderedEntries.length;
  const canonicalBase = goIndexBase.replace(/\/$/, "");
  const canonicalUrl = `${canonicalBase}/${artistSlug}/${slug}`;
  const artistLink = `<a class="artist-link" href="/artist/${encodeURIComponent(artistSlug)}">${escapeHtml(artistName)}</a>`;

  const linkButtons = orderedEntries
    .map(([platform, url]) => {
      const label = platform.charAt(0).toUpperCase() + platform.slice(1);
      return `<a class="link-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    })
    .join("\n");
  const linksClassName = linkCount >= 2 ? "links-grid" : "links-grid links-grid--single";

  const body = `
    <div class="smartlink-release">
      <div class="smartlink-release__cover">
        ${renderMedia({ src: coverUrlWithVersion, alt: title, className: "cover" })}
      </div>
      <div class="smartlink-release__info">
        <h1 class="smartlink-release__title">${escapeHtml(title)}</h1>
        <div class="smartlink-release__artist">
          ${artistLink}
        </div>
        ${releaseDate ? `<div class="smartlink-release__date">${escapeHtml(releaseDate)}</div>` : ""}
      </div>
      <div class="smartlink-release__links">
        ${linkButtons || "<span class=\"smartlink-release__empty\">Ссылок пока нет</span>"}
      </div>
      <div class="smartlink-release__share">
        <button class="share-btn" type="button" data-url="${escapeHtml(canonicalUrl)}" aria-label="Поделиться">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          <span>Поделиться</span>
        </button>
        <span class="copy-toast" role="status" aria-live="polite"></span>
      </div>
    </div>
    <script>
      (function() {
        async function copyOrShare(url, title) {
          if (!url) return { ok: false, shared: false };
          
          // Try Web Share API first (works on mobile and some desktop browsers)
          const canShare = navigator.share && (!navigator.canShare || navigator.canShare({ url: url }));
          if (canShare) {
            try {
              await navigator.share({ url: url, title: title || 'Поделиться' });
              return { ok: true, shared: true };
            } catch (e) {
              if (e.name === 'AbortError') return { ok: false, shared: true };
              // Share failed, fall through to clipboard
            }
          }
          
          // Try clipboard API
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
              await navigator.clipboard.writeText(url);
              return { ok: true, shared: false };
            } catch (e) {
              // Clipboard failed, fall through to execCommand
            }
          }
          
          // Fallback to execCommand
          try {
            const textarea = document.createElement('textarea');
            textarea.value = url;
            textarea.setAttribute('readonly', '');
            textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            return { ok: ok, shared: false };
          } catch (error) {
            return { ok: false, shared: false };
          }
        }

        function attachCopyHandlers() {
          document.querySelectorAll('.share-btn[data-url], .copy-btn[data-url]').forEach((button) => {
            const toast = button.parentElement?.querySelector('.copy-toast');

            button.addEventListener('click', async (event) => {
              event.preventDefault();
              event.stopPropagation();
              
              const urlToCopy = button.getAttribute('data-url') || '';
              const result = await copyOrShare(urlToCopy, document.title);

              if (result.shared) return;

              if (toast) {
                toast.textContent = result.ok ? 'Ссылка скопирована' : 'Не удалось скопировать';
                toast.classList.add('visible');
              }

              button.classList.toggle('copied', result.ok);

              window.setTimeout(() => {
                button.classList.remove('copied');
                toast?.classList.remove('visible');
              }, result.ok ? 1500 : 1800);
            });
          });
        }

        attachCopyHandlers();
      })();
    </script>
  `;

  return new Response(htmlPage(body, { title: `${title} — ${artistName}`, backgroundImage: coverUrlWithVersion }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=UTF-8", ...CACHE_HEADERS },
  });
}

async function renderArtistsIndex(env: Env, goIndexBase: string): Promise<Response> {
  try {
    const query = await env.DB.prepare(
      `WITH latest AS (
         SELECT artist_slug, MAX(COALESCE(updated_at, created_at, '')) AS max_ts, COUNT(*) AS cnt
         FROM smartlinks
         GROUP BY artist_slug
       )
       SELECT
         s.artist_slug AS artist_slug,
         s.slug AS slug,
         s.artist_name AS artist_name,
         s.cover_url AS cover_url,
         s.cover_source AS cover_source,
         s.cover_version AS cover_version,
         s.updated_at AS updated_at,
         l.cnt AS cnt
       FROM smartlinks s
       JOIN latest l
         ON l.artist_slug = s.artist_slug
        AND COALESCE(s.updated_at, s.created_at, '') = l.max_ts
       GROUP BY s.artist_slug
       ORDER BY datetime(l.max_ts) DESC
       LIMIT 600`,
    ).all<{
      artist_slug: string;
      slug: string;
      artist_name: string | null;
      cover_url: string | null;
      cover_source: string | null;
      cover_version: number | null;
      updated_at: string | null;
      cnt: number | null;
    }>();

    const items = query.results ?? [];

    const cards = items.map((record) => {
      const artistSlug = record.artist_slug;
      const latestSlug = (record.slug || "").trim() || "latest";
      const displayName = (record.artist_name || "").trim() || prettifySlug(artistSlug);
      const coverSource = parseCoverSource(record.cover_source, `[artists] ${artistSlug} cover_source`);
      const coverVersion = normalizeCoverVersionInput(record.cover_version ?? null);
      const coverUrlWithVersion = buildDisplayCoverUrl({
        coverUrl: record.cover_url,
        coverSource,
        artistSlug,
        slug: latestSlug,
        goIndexBase,
        coverVersion,
        context: `[artists] ${artistSlug} cover_display`,
      });
      const artistUrl = `/artist/${encodeURIComponent(artistSlug)}`;
      const count = Number(record.cnt || 0);
      const updatedAt = formatDisplayDate(record.updated_at);
      const releaseLabel =
        count % 10 === 1 && count % 100 !== 11
          ? "релиз"
          : count % 10 >= 2 && count % 10 <= 4 && !(count % 100 >= 12 && count % 100 <= 14)
            ? "релиза"
            : "релизов";
      const meta = [count ? `${count} ${releaseLabel}` : null, updatedAt ? `Обновлено ${escapeHtml(updatedAt)}` : null]
        .filter(Boolean)
        .join('<span class="meta-dot"></span>');

      return `
        <article class="smartlink-item" role="link">
          <a class="smartlink-main" href="${escapeHtml(artistUrl)}">
            ${renderMedia({ src: coverUrlWithVersion, alt: displayName, className: "smartlink-cover", fallbackLabel: "ARTIST" })}
            <div class="smartlink-content">
              <div class="smartlink-title-row">
                <div class="smartlink-title">${escapeHtml(displayName)}</div>
              </div>
              <div class="meta-row subtle">${meta || ""}</div>
            </div>
          </a>
        </article>
      `;
    });

    const body = `
      <div class="artist-header">
        <h1 class="artist-name">Артисты</h1>
        <div class="artist-meta">
          <span>Выбери артиста — откроется список его релизов.</span>
        </div>
      </div>
      ${
        cards.length
          ? `<div class="smartlink-list">${cards.join("\n")}</div>`
          : `<div class="empty-state">Пока нет артистов со смартлинками.</div>`
      }
    `;

    return new Response(htmlPage(body, { title: "Артисты — SREDA", pageClass: "page-artists" }), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=UTF-8", ...CACHE_HEADERS },
    });
  } catch (error) {
    console.error("[artists] db error", error);
    return renderError();
  }
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
      const apiKeyError = requireEnvValue(
        apiKey,
        "SMARTLINK_API_KEY",
        "Настройте SMARTLINK_API_KEY для доступа к /api/index/upsert.",
      );
      if (apiKeyError) {
        return apiKeyError;
      }

      const providedKey = request.headers.get("X-API-Key");
      const isAuthed = providedKey === apiKey;
      if (!isAuthed) {
        return jsonResponse({ ok: false, error: "unauthorized" }, 401);
      }

      const goIndexBase = env.GO_INDEX_BASE?.replace(/\/$/, "");
      const goIndexBaseError = requireEnvValue(
        goIndexBase,
        "GO_INDEX_BASE",
        "Настройте GO_INDEX_BASE для формирования канонических ссылок.",
      );
      if (goIndexBaseError) {
        return goIndexBaseError;
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
          artist_photo_url,
        } = payload ?? {};

        const { artistSlug: computedArtistSlug, releaseSlug: computedSlug, errors: slugErrors } =
          deriveSlugsFromPayload({
            id,
            title,
            artist_name,
            artist,
            artist_slug,
            slug,
          });

        if (!computedArtistSlug || !computedSlug || !title || slugErrors.length) {
          return jsonResponse(
            {
              ok: false,
              error: "bad_request",
              details: {
                fields: slugErrors,
                message: "Не удалось сформировать slug. Проверьте artist_slug и title/slug.",
              },
            },
            400,
          );
        }

        const canonicalId = `${computedArtistSlug}:${computedSlug}`;
        const normalizedLinksResult = normalizeLinksInput(links, "[upsert] links", { strict: true });
        if (normalizedLinksResult.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { links: normalizedLinksResult.error } },
            400,
          );
        }
        const allowlist = enforceLinksAllowlist(normalizedLinksResult.value, "[upsert] links_allowlist");
        if (allowlist.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { links: allowlist.error, rejected: allowlist.rejected } },
            400,
          );
        }
        const linksJson = JSON.stringify(allowlist.value);
        const coverSourceProvided = payload !== undefined && Object.prototype.hasOwnProperty.call(payload, "cover_source");
        const coverUrlProvided = payload !== undefined && Object.prototype.hasOwnProperty.call(payload, "cover_url");
        const normalizedCoverSource = coverSourceProvided
          ? normalizeCoverSourceInput(cover_source, "[upsert] cover_source")
          : null;
        const normalizedCoverUrl = coverUrlProvided ? resolveCoverUrl(cover_url) : null;
        const { owner: normalizedOwner, error: ownerError } = normalizeOwnerInput(owner);

        if (normalizedCoverSource?.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { cover_source: normalizedCoverSource.error } },
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
        let storedCoverFileId: string | null = null;
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
              cover_file_id,
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
              cover_file_id: string | null;
              owner_tg_user_id: string | null;
              owner_tg_username: string | null;
              owner_display_name: string | null;
            }>();

          const existing = existingRecord.results?.[0];

          if (
            existing?.id &&
            normalizedOwner?.tg_user_id &&
            existing.owner_tg_user_id &&
            normalizedOwner.tg_user_id !== existing.owner_tg_user_id
          ) {
            return jsonResponse(
              {
                ok: false,
                error: "slug_conflict",
                details: {
                  message: "Slug уже используется для другого владельца.",
                  artist_slug: computedArtistSlug,
                  slug: computedSlug,
                },
              },
              409,
            );
          }

          ownerSaved = Boolean(normalizedOwner && !existing?.owner_tg_user_id);
          storedCoverFileId = existing?.cover_file_id ?? null;

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

          const defaultCoverUrl = `${goIndexBase}/api/cover/${encodeURIComponent(computedArtistSlug)}/${encodeURIComponent(computedSlug)}`;
          const existingCoverUrl = resolveCoverUrl(existing?.cover_url ?? null);

          if (coverUrlProvided) {
            storedCoverUrl = normalizedCoverUrl;
          } else if (existingCoverUrl) {
            storedCoverUrl = existingCoverUrl;
          } else {
            storedCoverUrl = defaultCoverUrl;
          }

          if (!existing || coverSourceProvided || coverUrlProvided) {
            const parsedCoverSource = parseCoverSource(storedCoverSource, "[upsert] cover_source");
            storedCoverFileId = extractTelegramFileId(
              storedCoverUrl ?? undefined,
              parsedCoverSource,
              "[upsert] cover_file_id",
            );
          }

          const coverChanged =
            coverUrlProvided ||
            coverSourceProvided ||
            storedCoverVersion !== baseCoverVersion;
          storedCoverUpdatedAt = coverChanged
            ? new Date().toISOString()
            : existing?.cover_updated_at ?? null;

          // Normalize artist_photo_url
          const storedArtistPhotoUrl = typeof artist_photo_url === "string" && artist_photo_url.trim()
            ? artist_photo_url.trim()
            : null;

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
              cover_file_id,
              cover_version,
              cover_url,
              cover_updated_at,
              links_json,
              artist_photo_url,
              created_at,
              updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, datetime('now'), datetime('now'))
            ON CONFLICT(artist_slug, slug) DO UPDATE SET
              title=excluded.title,
              artist_name=excluded.artist_name,
              release_date=excluded.release_date,
              owner_tg_user_id=COALESCE(smartlinks.owner_tg_user_id, excluded.owner_tg_user_id),
              owner_tg_username=COALESCE(smartlinks.owner_tg_username, excluded.owner_tg_username),
              owner_display_name=COALESCE(smartlinks.owner_display_name, excluded.owner_display_name),
              cover_source=excluded.cover_source,
              cover_file_id=excluded.cover_file_id,
              cover_version=excluded.cover_version,
              cover_url=excluded.cover_url,
              cover_updated_at=excluded.cover_updated_at,
              links_json=excluded.links_json,
              artist_photo_url=COALESCE(excluded.artist_photo_url, smartlinks.artist_photo_url),
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
              storedCoverFileId,
              storedCoverVersion,
              storedCoverUrl,
              storedCoverUpdatedAt,
              linksJson,
              storedArtistPhotoUrl,
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

        // Синхронизация запускается для входящих upsert по умолчанию.
        // Если запрос приходит из веб-индекса (чтобы избежать циклов), используйте заголовок X-Skip-Sync: 1.
        const skipSync = request.headers.get("X-Skip-Sync") === "1";

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
                links: allowlist.value,
              },
              env,
            );
          } catch (error) {
            console.warn("smartlink sync error", error);
            syncResult = [false, null, error instanceof Error ? error.message : String(error)];
          }
        } else {
          console.info("smartlink sync skipped", { id: canonicalId, reason: "X-Skip-Sync" });
        }

        const [synced, syncStatus, syncError] = syncResult;
        if (!synced) {
          console.warn("smartlink sync failed", {
            id: canonicalId,
            status: syncStatus,
            error: syncError,
          });
          return jsonResponse(
            { ok: false, error: "sync_failed", details: { status: syncStatus, error: syncError } },
            502,
          );
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

    if (normalizedPath === "/api/index/my" || normalizedPath === "/api/my") {
      if (request.method !== "GET") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

      const apiKey = env.SMARTLINK_API_KEY;
      const apiKeyError = requireEnvValue(
        apiKey,
        "SMARTLINK_API_KEY",
        "Настройте SMARTLINK_API_KEY для доступа к /api/index/my.",
      );
      if (apiKeyError) {
        return apiKeyError;
      }

      const providedKey = request.headers.get("X-API-Key");
      if (providedKey !== apiKey) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

      await ensureSchema(env.DB);

      const owner = (url.searchParams.get("owner_tg_user_id") || "").trim();
      const page = Math.max(0, Number(url.searchParams.get("page") || "0") || 0);
      const limitRaw = Number(url.searchParams.get("limit") || "10") || 10;
      const limit = Math.min(25, Math.max(1, limitRaw));
      const offset = page * limit;

      if (!owner) return jsonResponse({ ok: false, error: "bad_request" }, 400);

      const countRes = await env.DB
        .prepare(`SELECT COUNT(*) as cnt FROM smartlinks WHERE owner_tg_user_id = ?`)
        .bind(owner)
        .first<{ cnt: number }>();

      const total = Number(countRes?.cnt || 0);
      const total_pages = Math.max(1, Math.ceil(total / limit));

      const rows = await env.DB
        .prepare(
          `SELECT id, artist_slug, slug, title, artist_name, release_date, cover_url, cover_version, updated_at
           FROM smartlinks
           WHERE owner_tg_user_id = ?
           ORDER BY datetime(updated_at) DESC
           LIMIT ? OFFSET ?`
        )
        .bind(owner, limit, offset)
        .all();

      return jsonResponse({
        ok: true,
        page,
        limit,
        total,
        // Backward-compatible field name expected by iskra-bot
        total_count: total,
        total_pages,
        items: (rows.results || []).map((r: any) => ({
          id: r.id,
          artist_slug: r.artist_slug,
          slug: r.slug,
          title: r.title,
          artist: r.artist_name,
          release_date: r.release_date,
          cover_url: r.cover_url,
          cover_version: r.cover_version,
          updated_at: r.updated_at,
        })),
      });
    }

    // Backward-compatible endpoint expected by iskra-bot:
    // GET /api/smartlinks/:artist_slug/:slug (private, X-API-Key)
    if (segments.length === 4 && segments[0] === "api" && segments[1] === "smartlinks") {
      if (request.method !== "GET") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

      const apiKey = env.SMARTLINK_API_KEY;
      if (!apiKey) return jsonResponse({ ok: false, error: "server_error" }, 500);

      const providedKey = request.headers.get("X-API-Key");
      if (providedKey !== apiKey) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

      await ensureSchema(env.DB);

      const artist_slug = decodeURIComponent(segments[2] || "").trim();
      const slug = decodeURIComponent(segments[3] || "").trim();
      if (!artist_slug || !slug) return jsonResponse({ ok: false, error: "bad_request" }, 400);

      const record = await env.DB
        .prepare(`SELECT * FROM smartlinks WHERE artist_slug=?1 AND slug=?2 LIMIT 1`)
        .bind(artist_slug, slug)
        .first<any>();

      if (!record) return jsonResponse({ ok: false, error: "not_found" }, 404);

      const item = {
        id: record.id,
        artist_slug: record.artist_slug,
        slug: record.slug,
        title: record.title,
        artist: record.artist_name,
        artist_name: record.artist_name,
        release_date: record.release_date,
        cover_url: record.cover_url,
        cover_version: record.cover_version,
        cover_source: parseCoverSource(record.cover_source, "[api/smartlinks] cover_source"),
        cover_file_id: record.cover_file_id,
        owner_tg_user_id: record.owner_tg_user_id,
        owner_tg_username: record.owner_tg_username,
        owner_display_name: record.owner_display_name,
        caption_text: record.caption_text,
        branding_disabled: record.branding_disabled,
        branding_paid: record.branding_paid,
        pre_save_enabled: record.pre_save_enabled,
        reminders_enabled: record.reminders_enabled,
        links: parseLinksFromJson(record.links_json, "[api/smartlinks] links_json"),
        updated_at: record.updated_at,
        created_at: record.created_at,
      };

      return jsonResponse({ ok: true, item });
    }
    
    if (normalizedPath === "/api/index/patch") {
      if (request.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

      const apiKey = env.SMARTLINK_API_KEY;
      const apiKeyError = requireEnvValue(
        apiKey,
        "SMARTLINK_API_KEY",
        "Настройте SMARTLINK_API_KEY для доступа к /api/index/patch.",
      );
      if (apiKeyError) {
        return apiKeyError;
      }

      const providedKey = request.headers.get("X-API-Key");
      if (providedKey !== apiKey) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

      await ensureSchema(env.DB);

      let payload: any;
      try {
        payload = await request.json();
      } catch {
        return jsonResponse({ ok: false, error: "bad_request" }, 400);
      }

      const artist_slug = String(payload?.artist_slug || "").trim();
      const slug = String(payload?.slug || "").trim();
      const owner_tg_user_id = String(payload?.owner_tg_user_id || "").trim();
      const patch = payload?.patch || {};

      if (!artist_slug || !slug || !owner_tg_user_id || typeof patch !== "object") {
        return jsonResponse({ ok: false, error: "bad_request" }, 400);
      }

      const existing = await env.DB
        .prepare(`SELECT * FROM smartlinks WHERE artist_slug = ? AND slug = ? LIMIT 1`)
        .bind(artist_slug, slug)
        .first<any>();

      if (!existing) return jsonResponse({ ok: false, error: "not_found" }, 404);
      if (String(existing.owner_tg_user_id || "") !== owner_tg_user_id) return jsonResponse({ ok: false, error: "forbidden" }, 403);

      // разрешаем менять только конкретные поля
      const next: any = { ...existing };

      if (Object.prototype.hasOwnProperty.call(patch, "title")) next.title = String(patch.title || "").trim();
      if (Object.prototype.hasOwnProperty.call(patch, "artist_name")) next.artist_name = patch.artist_name ? String(patch.artist_name) : null;
      if (Object.prototype.hasOwnProperty.call(patch, "release_date")) next.release_date = patch.release_date ? String(patch.release_date) : null;
      if (Object.prototype.hasOwnProperty.call(patch, "caption_text")) next.caption_text = patch.caption_text ? String(patch.caption_text) : null;

      if (Object.prototype.hasOwnProperty.call(patch, "links")) {
        const normalizedLinksResult = normalizeLinksInput(patch.links, "[patch] links", {
          strict: true,
        });
        if (normalizedLinksResult.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { links: normalizedLinksResult.error } },
            400,
          );
        }
        const allowlist = enforceLinksAllowlist(normalizedLinksResult.value, "[patch] links_allowlist");
        if (allowlist.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { links: allowlist.error, rejected: allowlist.rejected } },
            400,
          );
        }
        next.links_json = JSON.stringify(allowlist.value);
      }

      if (Object.prototype.hasOwnProperty.call(patch, "cover_url")) {
        next.cover_url = patch.cover_url ? resolveCoverUrl(String(patch.cover_url)) : null;
      }

      if (Object.prototype.hasOwnProperty.call(patch, "cover_version")) {
        const v = Number(patch.cover_version);
        next.cover_version = Number.isFinite(v) ? v : next.cover_version;
      }

      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      next.updated_at = now;

      await env.DB
        .prepare(
          `UPDATE smartlinks SET
            title=?,
            artist_name=?,
            release_date=?,
            links_json=?,
            cover_url=?,
            cover_version=?,
            caption_text=?,
            updated_at=?
           WHERE artist_slug=? AND slug=? AND owner_tg_user_id=?`
        )
        .bind(
          next.title,
          next.artist_name,
          next.release_date,
          next.links_json,
          next.cover_url,
          next.cover_version,
          next.caption_text,
          next.updated_at,
          artist_slug,
          slug,
          owner_tg_user_id
        )
        .run();

      return jsonResponse({ ok: true });
    }

    // Admin endpoint to get smartlinks needing artist photo migration
    if (normalizedPath === "/api/admin/migrate-photos") {
      if (request.method !== "GET") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

      const apiKey = env.SMARTLINK_API_KEY;
      const apiKeyError = requireEnvValue(
        apiKey,
        "SMARTLINK_API_KEY",
        "Настройте SMARTLINK_API_KEY для доступа к /api/admin/migrate-photos.",
      );
      if (apiKeyError) {
        return apiKeyError;
      }

      const providedKey = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ||
        request.headers.get("X-API-Key");
      if (providedKey !== apiKey) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

      await ensureSchema(env.DB);

      try {
        // Get all smartlinks with Yandex links but no artist_photo_url
        const query = await env.DB.prepare(
          `SELECT
            id,
            artist_slug,
            slug,
            title,
            artist_name,
            links_json,
            artist_photo_url
          FROM smartlinks
          WHERE artist_photo_url IS NULL OR artist_photo_url = ''
          ORDER BY updated_at DESC
          LIMIT 500`,
        ).all<{
          id: string;
          artist_slug: string;
          slug: string;
          title: string | null;
          artist_name: string | null;
          links_json: string | null;
          artist_photo_url: string | null;
        }>();

        const items = (query.results ?? [])
          .map((record) => {
            const links = parseLinksFromJson(record.links_json, "[migrate-photos] links_json");
            // Only include if it has a Yandex link
            if (!links.yandex) return null;
            return {
              id: record.id,
              artist_slug: record.artist_slug,
              slug: record.slug,
              title: record.title,
              artist_name: record.artist_name,
              links,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        return jsonResponse({
          ok: true,
          count: items.length,
          items,
        });
      } catch (error) {
        console.error("[api/admin/migrate-photos] db error", error);
        return jsonResponse({ ok: false, error: "db_error" }, 500);
      }
    }
       
    if (normalizedPath === "/api/index/get") {
      if (request.method !== "GET") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

      const apiKey = env.SMARTLINK_API_KEY;
      const apiKeyError = requireEnvValue(
        apiKey,
        "SMARTLINK_API_KEY",
        "Настройте SMARTLINK_API_KEY для доступа к /api/index/get.",
      );
      if (apiKeyError) {
        return apiKeyError;
      }

      const providedKey = request.headers.get("X-API-Key");
      if (providedKey !== apiKey) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

      await ensureSchema(env.DB);

      const artist_slug = (url.searchParams.get("artist_slug") || "").trim();
      const slug = (url.searchParams.get("slug") || "").trim();
      if (!artist_slug || !slug) return jsonResponse({ ok: false, error: "bad_request" }, 400);

      const row = await env.DB
        .prepare(`SELECT * FROM smartlinks WHERE artist_slug = ? AND slug = ? LIMIT 1`)
        .bind(artist_slug, slug)
        .first();

      if (!row) return jsonResponse({ ok: false, error: "not_found" }, 404);

      return jsonResponse({ ok: true, item: row });
    }

    if (segments.length >= 2 && segments[0] === "api" && segments[1] === "smartlinks") {
      const authError = requireIndexAuth(request, env);
      if (authError) {
        return authError;
      }

      await ensureSchema(env.DB);

      if (segments.length === 2 && request.method === "GET") {
        const ownerTgId = getOwnerTgId(url);
        if (!ownerTgId) {
          return jsonResponse({ ok: false, error: "bad_request", details: "missing_owner_tg_id" }, 400);
        }

        try {
          const query = await env.DB.prepare(
            `SELECT * FROM smartlinks WHERE owner_tg_user_id = :tg_id ORDER BY updated_at DESC`,
          )
            .bind(String(ownerTgId))
            .all<{
              id: string;
              artist_slug: string;
              slug: string;
              title: string | null;
              artist_name: string | null;
              release_date: string | null;
              cover_url: string | null;
              cover_source: string | null;
              cover_version: number | null;
              cover_file_id: string | null;
              caption_text: string | null;
              flags: string | null;
              links_json: string | null;
              updated_at: string | null;
              owner_tg_user_id: string | null;
              owner_tg_username: string | null;
              owner_display_name: string | null;
            }>();

          const items = (query.results ?? []).map((record) => ({
            id: record.id,
            artist_slug: record.artist_slug,
            slug: record.slug,
            title: record.title,
            artist_name: record.artist_name,
            release_date: record.release_date,
            cover_url: resolveCoverUrl(record.cover_url ?? null),
            cover_source: parseCoverSource(record.cover_source, "[api/smartlinks] cover_source"),
            cover_version: record.cover_version ?? 0,
            cover_file_id: record.cover_file_id,
            caption_text: record.caption_text,
            flags: record.flags,
            links: parseLinksFromJson(record.links_json, "[api/smartlinks] links_json"),
            updated_at: record.updated_at,
            owner: buildOwnerResponse(record),
          }));

          return jsonResponse({
            ok: true,
            owner_tg_id: String(ownerTgId),
            count: items.length,
            items,
          });
        } catch (error) {
          console.error("[api/smartlinks] list db error", error);
          return jsonResponse({ ok: false, error: "db_error" }, 500);
        }
      }

      if (segments.length === 4 && request.method === "GET") {
        const artistSlug = decodeURIComponent(segments[2]);
        const slug = decodeURIComponent(segments[3]);

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
              cover_source,
              cover_version,
              cover_file_id,
              caption_text,
              flags,
              links_json,
              updated_at,
              owner_tg_user_id,
              owner_tg_username,
              owner_display_name
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
              cover_url: string | null;
              cover_source: string | null;
              cover_version: number | null;
              cover_file_id: string | null;
              caption_text: string | null;
              flags: string | null;
              links_json: string | null;
              updated_at: string | null;
              owner_tg_user_id: string | null;
              owner_tg_username: string | null;
              owner_display_name: string | null;
            }>();

          const record = query.results?.[0];
          if (!record) {
            return jsonResponse({ ok: false, error: "not_found" }, 404);
          }

          return jsonResponse({
            ok: true,
            item: {
              id: record.id,
              artist_slug: record.artist_slug,
              slug: record.slug,
              title: record.title,
              artist_name: record.artist_name,
              release_date: record.release_date,
              cover_url: resolveCoverUrl(record.cover_url ?? null),
              cover_source: parseCoverSource(record.cover_source, "[api/smartlinks] cover_source"),
              cover_version: record.cover_version ?? 0,
              cover_file_id: record.cover_file_id,
              caption_text: record.caption_text,
              flags: record.flags,
              links: parseLinksFromJson(record.links_json, "[api/smartlinks] links_json"),
              updated_at: record.updated_at,
              owner: buildOwnerResponse(record),
            },
          });
        } catch (error) {
          console.error("[api/smartlinks] fetch db error", error);
          return jsonResponse({ ok: false, error: "db_error" }, 500);
        }
      }

      if (segments.length === 4 && (request.method === "PUT" || request.method === "PATCH")) {
        const artistSlug = decodeURIComponent(segments[2]);
        const slug = decodeURIComponent(segments[3]);
        const ownerTgId = getOwnerTgId(url);
        if (!ownerTgId) {
          return jsonResponse({ ok: false, error: "bad_request", details: "missing_tg_id" }, 400);
        }

        let payload: Record<string, unknown> = {};
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch (error) {
          console.error("[api/smartlinks] update parse error", error);
          return jsonResponse({ ok: false, error: "bad_request", details: "invalid_json" }, 400);
        }

        const hasLinks = Object.prototype.hasOwnProperty.call(payload, "links");
        const hasReleaseDate = Object.prototype.hasOwnProperty.call(payload, "release_date");
        const hasCaptionText = Object.prototype.hasOwnProperty.call(payload, "caption_text");
        const hasFlags = Object.prototype.hasOwnProperty.call(payload, "flags");
        const coverPayloadProvided = Object.prototype.hasOwnProperty.call(payload, "cover");
        let coverSourceProvided = Object.prototype.hasOwnProperty.call(payload, "cover_source");
        let coverUrlProvided = Object.prototype.hasOwnProperty.call(payload, "cover_url");
        let coverFileIdProvided = Object.prototype.hasOwnProperty.call(payload, "cover_file_id");

        const normalizedLinksResult = hasLinks
          ? normalizeLinksInput(payload.links, "[api/smartlinks update] links", { strict: true })
          : null;
        const normalizedReleaseDate = hasReleaseDate
          ? normalizeTextInput(payload.release_date, "[api/smartlinks update] release_date")
          : { value: null, error: null };
        const normalizedCaptionText = hasCaptionText
          ? normalizeTextInput(payload.caption_text, "[api/smartlinks update] caption_text")
          : { value: null, error: null };
        const normalizedFlags = hasFlags
          ? normalizeFlagsInput(payload.flags, "[api/smartlinks update] flags")
          : { value: null, error: null };
        let normalizedCoverSource = coverSourceProvided
          ? normalizeCoverSourceInput(payload.cover_source, "[api/smartlinks update] cover_source")
          : null;
        let normalizedCoverUrl: string | null = null;
        if (coverUrlProvided) {
          const rawCoverUrl = payload.cover_url;
          if (rawCoverUrl === null || rawCoverUrl === undefined || rawCoverUrl === "") {
            normalizedCoverUrl = null;
          } else if (typeof rawCoverUrl === "string") {
            normalizedCoverUrl = resolveCoverUrl(rawCoverUrl);
          } else {
            return jsonResponse({ ok: false, error: "bad_request", details: "invalid_cover_url" }, 400);
          }
        }
        let normalizedCoverFileId: string | null = null;

        if (coverFileIdProvided) {
          const rawFileId = payload.cover_file_id;
          if (rawFileId === null || rawFileId === undefined || rawFileId === "") {
            normalizedCoverFileId = null;
          } else if (typeof rawFileId === "string") {
            const trimmed = rawFileId.trim();
            if (!trimmed) {
              normalizedCoverFileId = null;
            } else if (!validateTelegramFileId(trimmed)) {
              return jsonResponse({ ok: false, error: "bad_request", details: "invalid_cover_file_id" }, 400);
            } else {
              normalizedCoverFileId = trimmed;
            }
          } else {
            return jsonResponse({ ok: false, error: "bad_request", details: "invalid_cover_file_id" }, 400);
          }
        }

        if (coverPayloadProvided && !coverSourceProvided && !coverUrlProvided && !coverFileIdProvided) {
          const rawCover = payload.cover;
          if (typeof rawCover === "string") {
            const telegramFileId = extractTelegramFileIdFromString(rawCover, "[api/smartlinks update] cover");
            if (telegramFileId) {
              coverFileIdProvided = true;
              coverSourceProvided = true;
              normalizedCoverFileId = telegramFileId;
              normalizedCoverSource = {
                value: JSON.stringify({ type: "telegram", file_id: telegramFileId }),
                error: false,
              };
            } else {
              coverUrlProvided = true;
              normalizedCoverUrl = resolveCoverUrl(rawCover);
            }
          } else if (rawCover && typeof rawCover === "object") {
            const candidate = rawCover as { telegram?: unknown; url?: unknown; type?: unknown; file_id?: unknown };
            if (typeof candidate.telegram === "string") {
              const trimmed = candidate.telegram.trim();
              if (!validateTelegramFileId(trimmed)) {
                return jsonResponse(
                  { ok: false, error: "bad_request", details: "invalid_cover_file_id" },
                  400,
                );
              }
              coverFileIdProvided = true;
              coverSourceProvided = true;
              normalizedCoverFileId = trimmed;
              normalizedCoverSource = {
                value: JSON.stringify({ type: "telegram", file_id: trimmed }),
                error: false,
              };
            } else if (typeof candidate.url === "string") {
              coverUrlProvided = true;
              normalizedCoverUrl = resolveCoverUrl(candidate.url);
            } else if (candidate.type) {
              coverSourceProvided = true;
              normalizedCoverSource = normalizeCoverSourceInput(
                candidate,
                "[api/smartlinks update] cover",
              );
            }
          }
        }

        if (normalizedReleaseDate.error || normalizedCaptionText.error || normalizedFlags.error) {
          return jsonResponse({ ok: false, error: "bad_request", details: "invalid_text_input" }, 400);
        }

        if (normalizedLinksResult?.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { links: normalizedLinksResult.error } },
            400,
          );
        }
        const allowlist = normalizedLinksResult
          ? enforceLinksAllowlist(normalizedLinksResult.value, "[api/smartlinks update] links_allowlist")
          : null;
        if (allowlist?.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { links: allowlist.error, rejected: allowlist.rejected } },
            400,
          );
        }

        if (normalizedCoverSource?.error) {
          return jsonResponse(
            { ok: false, error: "bad_request", details: { cover_source: normalizedCoverSource.error } },
            400,
          );
        }

        try {
          const existingQuery = await env.DB.prepare(
            `SELECT
              id,
              links_json,
              release_date,
              caption_text,
              flags,
              cover_source,
              cover_url,
              cover_version,
              cover_updated_at,
              cover_file_id,
              owner_tg_user_id,
              owner_tg_username,
              owner_display_name
            FROM smartlinks
            WHERE artist_slug=?1 AND slug=?2
            LIMIT 1`,
          )
            .bind(artistSlug, slug)
            .all<{
              id: string;
              links_json: string | null;
              release_date: string | null;
              caption_text: string | null;
              flags: string | null;
              cover_source: string | null;
              cover_url: string | null;
              cover_version: number | null;
              cover_updated_at: string | null;
              cover_file_id: string | null;
              owner_tg_user_id: string | null;
              owner_tg_username: string | null;
              owner_display_name: string | null;
            }>();

          const existing = existingQuery.results?.[0];
          if (!existing) {
            return jsonResponse({ ok: false, error: "not_found" }, 404);
          }

          if (!existing.owner_tg_user_id || String(existing.owner_tg_user_id) !== ownerTgId) {
            return jsonResponse({ ok: false, error: "forbidden" }, 403);
          }

          const storedLinksJson = hasLinks ? JSON.stringify(allowlist?.value ?? {}) : existing.links_json;
          const storedReleaseDate = hasReleaseDate ? normalizedReleaseDate.value : existing.release_date;
          const storedCaptionText = hasCaptionText ? normalizedCaptionText.value : existing.caption_text;
          const storedFlags = hasFlags ? normalizedFlags.value : existing.flags;

          let storedCoverSource = existing.cover_source;
          let storedCoverUrl = existing.cover_url;
          let storedCoverFileId = existing.cover_file_id;

          if (coverSourceProvided) {
            storedCoverSource = normalizedCoverSource?.value ?? null;
          }

          if (coverUrlProvided) {
            storedCoverUrl = normalizedCoverUrl;
          }

          if (coverFileIdProvided) {
            storedCoverFileId = normalizedCoverFileId;
            if (!coverSourceProvided) {
              storedCoverSource = normalizedCoverFileId
                ? JSON.stringify({ type: "telegram", file_id: normalizedCoverFileId })
                : null;
            }
          }

          if (!coverFileIdProvided && coverSourceProvided) {
            const parsedCover = parseCoverSource(storedCoverSource, "[api/smartlinks update] cover_source");
            if (isTelegramCoverSource(parsedCover)) {
              storedCoverFileId = parsedCover.file_id.trim();
            } else {
              storedCoverFileId = null;
            }
          }

          const baseCoverVersion = existing.cover_version ?? 0;
          const coverChanged = coverSourceProvided || coverUrlProvided || coverFileIdProvided;
          const storedCoverVersion = coverChanged ? baseCoverVersion + 1 : baseCoverVersion;
          const storedCoverUpdatedAt = coverChanged ? new Date().toISOString() : existing.cover_updated_at;

          await env.DB.prepare(
            `UPDATE smartlinks
            SET
              links_json=?1,
              release_date=?2,
              caption_text=?3,
              flags=?4,
              cover_source=?5,
              cover_url=?6,
              cover_version=?7,
              cover_updated_at=?8,
              cover_file_id=?9,
              updated_at=datetime('now')
            WHERE artist_slug=?10 AND slug=?11`,
          )
            .bind(
              storedLinksJson,
              storedReleaseDate,
              storedCaptionText,
              storedFlags,
              storedCoverSource,
              storedCoverUrl,
              storedCoverVersion,
              storedCoverUpdatedAt,
              storedCoverFileId,
              artistSlug,
              slug,
            )
            .run();

          const normalizedLinksOutput = storedLinksJson
            ? parseLinksFromJson(storedLinksJson, "[api/smartlinks update] links_json")
            : {};

          return jsonResponse({
            ok: true,
            item: {
              id: existing.id,
              artist_slug: artistSlug,
              slug,
              release_date: storedReleaseDate,
              cover_url: resolveCoverUrl(storedCoverUrl ?? null),
              cover_source: parseCoverSource(storedCoverSource, "[api/smartlinks update] cover_source"),
              cover_version: storedCoverVersion,
              cover_file_id: storedCoverFileId,
              caption_text: storedCaptionText,
              flags: storedFlags,
              links: normalizedLinksOutput,
              owner: buildOwnerResponse(existing),
            },
          });
        } catch (error) {
          console.error("[api/smartlinks] update db error", error);
          return jsonResponse({ ok: false, error: "db_error" }, 500);
        }
      }

      return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
    }

    if (request.method !== "GET") {
      return renderNotFound();
    }

    await ensureSchema(env.DB);

    const goIndexBase =
      env.GO_INDEX_BASE?.replace(/\/$/, "") ?? new URL(request.url).origin;
    if (!env.GO_INDEX_BASE) {
      console.warn("[env] GO_INDEX_BASE missing, falling back to request origin");
    }

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
      const authError = requireIndexAuth(request, env);
      if (authError) {
        return authError;
      }

      const normalizedTgUserId = getOwnerTgId(url);

      if (!normalizedTgUserId) {
        return jsonResponse({ ok: false, error: "bad_request", details: "missing_tg_user_id" }, 400);
      }

      try {
        const query = await env.DB.prepare(
          `SELECT * FROM smartlinks WHERE owner_tg_user_id = :tg_id ORDER BY updated_at DESC`,
        )
          .bind(String(normalizedTgUserId))
          .all<{
            id: string;
            artist_slug: string;
            slug: string;
            title: string | null;
            artist_name: string | null;
            release_date: string | null;
            cover_url: string | null;
            cover_source: string | null;
            cover_version: number | null;
            cover_file_id: string | null;
            caption_text: string | null;
            flags: string | null;
            links_json: string | null;
            cover_updated_at: string | null;
            created_at: string | null;
            updated_at: string | null;
            owner_tg_user_id: string | null;
            owner_tg_username: string | null;
            owner_display_name: string | null;
          }>();

        const items = (query.results ?? []).map((record) => ({
          id: record.id,
          artist_slug: record.artist_slug,
          slug: record.slug,
          title: record.title,
          artist_name: record.artist_name,
          release_date: record.release_date,
          cover_url: resolveCoverUrl(record.cover_url ?? null),
          cover_source: parseCoverSource(record.cover_source, "[api/my] cover_source"),
          cover_version: record.cover_version ?? 0,
          cover_file_id: record.cover_file_id,
          cover_updated_at: record.cover_updated_at,
          caption_text: record.caption_text,
          flags: record.flags,
          links: parseLinksFromJson(record.links_json, "[api/my] links_json"),
          created_at: record.created_at,
          updated_at: record.updated_at,
          owner: buildOwnerResponse(record),
        }));

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
        return jsonResponse(
          {
            ok: false,
            error: "missing_env",
            details: {
              env: "ISKRA_API_BASE",
              message: "Настройте ISKRA_API_BASE для доступа к ИСКРА API.",
            },
          },
          503,
        );
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
        return jsonResponse(
          {
            ok: false,
            error: "missing_env",
            details: {
              env: "ISKRA_API_BASE",
              message: "Настройте ISKRA_API_BASE для доступа к ИСКРА API.",
            },
          },
          503,
        );
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

    if (segments.length === 1 && segments[0] === "artist") {
      return renderArtistsIndex(env, goIndexBase);
    }

    if (segments.length === 2 && segments[0] === "artist") {
      const artistSlug = decodeURIComponent(segments[1]);
      return renderArtistPage(artistSlug, env, goIndexBase);
    }

    if (segments.length === 0) {
      return renderHome();
    }

    if (segments.length === 1) {
      const candidate = segments[0];
      const reserved = new Set(["artist", "api", "cover", "_cover", "debug"]);

      if (!reserved.has(candidate)) {
        const target = `/artist/${encodeURIComponent(candidate)}`;
        const redirectUrl = new URL(target, url.origin);
        return Response.redirect(redirectUrl.toString(), 302);
      }
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

      const resolvedCoverUrl = resolvePreferredCoverUrl({
        coverUrl: record.cover_url,
        coverSource,
        artistSlug,
        slug,
        goIndexBase,
        context: `[render ${artistSlug}/${slug}] cover_source preferred`,
      });

      const data: ApiSmartlink = {
        id: record.id,
        title: record.title ?? undefined,
        artist: record.artist_name ?? undefined,
        artist_name: record.artist_name ?? undefined,
        release_date: record.release_date ?? undefined,
        cover_version: record.cover_version ?? undefined,
        cover_url: resolvedCoverUrl ?? undefined,
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
