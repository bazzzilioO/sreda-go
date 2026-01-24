import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";

class FakeStatement {
  params = [];

  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async all() {
    return { results: this.db.query(this.sql, this.params) };
  }

  async first() {
    const result = this.db.query(this.sql, this.params);
    return result[0] ?? null;
  }

  async run() {
    this.db.run(this.sql, this.params);
    return { success: true };
  }
}

class FakeD1 {
  records = new Map();

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  query(sql, params) {
    if (/SELECT COUNT\(\*\) as cnt FROM smartlinks/i.test(sql)) {
      const owner = String(params[0] ?? "");
      const count = [...this.records.values()].filter(
        (record) => record.owner_tg_user_id === owner,
      ).length;
      return [{ cnt: count }];
    }

    if (/WHERE\s+owner_tg_user_id/i.test(sql)) {
      const owner = String(params[0] ?? "");
      const limit = Number(params[1] ?? 1000);
      const offset = Number(params[2] ?? 0);
      const results = [...this.records.values()]
        .filter((record) => record.owner_tg_user_id === owner)
        .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
        .slice(offset, offset + limit);
      return results;
    }

    if (/WHERE\s+artist_slug/i.test(sql)) {
      const artistSlug = String(params[0] ?? "");
      const slug = params.length > 1 ? String(params[1] ?? "") : null;
      if (slug) {
        const record = this.records.get(this.key(artistSlug, slug));
        return record ? [record] : [];
      }

      const results = [...this.records.values()]
        .filter((record) => record.artist_slug === artistSlug)
        .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
        .slice(0, 400);
      return results;
    }

    if (/WHERE\s+id/i.test(sql)) {
      const id = String(params[0] ?? "");
      const record = [...this.records.values()].find((item) => item.id === id);
      return record ? [record] : [];
    }

    if (/FROM smartlinks WHERE owner_tg_user_id = :tg_id/i.test(sql)) {
      const owner = String(params[0] ?? "");
      const results = [...this.records.values()].filter(
        (record) => record.owner_tg_user_id === owner,
      );
      return results;
    }

    return [];
  }

  run(sql, params) {
    if (/ALTER TABLE smartlinks/i.test(sql) || /CREATE INDEX/i.test(sql)) {
      return;
    }

    if (/INSERT INTO smartlinks/i.test(sql)) {
      const [
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
      ] = params;

      const now = new Date().toISOString();
      const key = this.key(String(artist_slug), String(slug));
      const existing = this.records.get(key);
      const record = {
        id: String(id),
        artist_slug: String(artist_slug),
        slug: String(slug),
        title: title ?? null,
        artist_name: artist_name ?? null,
        release_date: release_date ?? null,
        owner_tg_user_id: owner_tg_user_id ?? null,
        owner_tg_username: owner_tg_username ?? null,
        owner_display_name: owner_display_name ?? null,
        cover_source: cover_source ?? null,
        cover_file_id: cover_file_id ?? null,
        cover_version: cover_version ? Number(cover_version) : 0,
        cover_url: cover_url ?? null,
        cover_updated_at: cover_updated_at ?? null,
        links_json: links_json ?? null,
        caption_text: existing?.caption_text ?? null,
        flags: existing?.flags ?? null,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };

      if (existing) {
        record.owner_tg_user_id = existing.owner_tg_user_id ?? record.owner_tg_user_id;
        record.owner_tg_username = existing.owner_tg_username ?? record.owner_tg_username;
        record.owner_display_name = existing.owner_display_name ?? record.owner_display_name;
      }

      this.records.set(key, record);
      return;
    }

    if (/UPDATE smartlinks SET/i.test(sql) && /owner_tg_user_id/i.test(sql)) {
      const [
        title,
        artist_name,
        release_date,
        links_json,
        cover_url,
        cover_version,
        caption_text,
        updated_at,
        artist_slug,
        slug,
        owner_tg_user_id,
      ] = params;
      const key = this.key(String(artist_slug), String(slug));
      const record = this.records.get(key);
      if (!record || record.owner_tg_user_id !== owner_tg_user_id) return;
      record.title = title ?? null;
      record.artist_name = artist_name ?? null;
      record.release_date = release_date ?? null;
      record.links_json = links_json ?? null;
      record.cover_url = cover_url ?? null;
      record.cover_version = cover_version ? Number(cover_version) : record.cover_version;
      record.caption_text = caption_text ?? null;
      record.updated_at = updated_at ?? record.updated_at;
      this.records.set(key, record);
      return;
    }

    if (/UPDATE smartlinks\s+SET/i.test(sql) && /cover_updated_at/i.test(sql)) {
      const [
        links_json,
        release_date,
        caption_text,
        flags,
        cover_source,
        cover_url,
        cover_version,
        cover_updated_at,
        cover_file_id,
        artist_slug,
        slug,
      ] = params;
      const key = this.key(String(artist_slug), String(slug));
      const record = this.records.get(key);
      if (!record) return;
      record.links_json = links_json ?? null;
      record.release_date = release_date ?? null;
      record.caption_text = caption_text ?? null;
      record.flags = flags ?? null;
      record.cover_source = cover_source ?? null;
      record.cover_url = cover_url ?? null;
      record.cover_version = cover_version ? Number(cover_version) : record.cover_version;
      record.cover_updated_at = cover_updated_at ?? null;
      record.cover_file_id = cover_file_id ?? null;
      record.updated_at = new Date().toISOString();
      this.records.set(key, record);
    }
  }

  key(artistSlug, slug) {
    return `${artistSlug}:${slug}`;
  }
}

function buildEnv() {
  return {
    DB: new FakeD1(),
    ISKRA_API_BASE: "https://iskra.example",
    SMARTLINK_API_KEY: "test-key",
    GO_INDEX_BASE: "https://go.test",
  };
}

async function request(env, path, init) {
  const req = new Request(`https://worker.test${path}`, init);
  return worker.fetch(req, env);
}

test("upsert creates a record and normalizes slug", async () => {
  const env = buildEnv();
  const response = await request(env, "/api/index/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.SMARTLINK_API_KEY,
      "X-Skip-Sync": "1",
    },
    body: JSON.stringify({
      title: "Мой релиз",
      artist_name: "Артист",
      links: { spotify: "https://open.spotify.com/track/0" },
      owner: { tg_user_id: "11" },
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.artist_slug, "artist");
  assert.equal(payload.slug, "moy-reliz");
});

test("upsert rejects slug collision for another owner", async () => {
  const env = buildEnv();
  await request(env, "/api/index/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.SMARTLINK_API_KEY,
      "X-Skip-Sync": "1",
    },
    body: JSON.stringify({
      title: "Релиз",
      artist_name: "Артист",
      owner: { tg_user_id: "1" },
    }),
  });
  const [existing] = env.DB.records.values();
  assert.equal(existing.owner_tg_user_id, "1");

  const response = await request(env, "/api/index/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.SMARTLINK_API_KEY,
      "X-Skip-Sync": "1",
    },
    body: JSON.stringify({
      title: "Релиз",
      artist_name: "Артист",
      owner: { tg_user_id: "2" },
    }),
  });

  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.error, "slug_conflict");
});

test("index patch updates owned records", async () => {
  const env = buildEnv();
  await request(env, "/api/index/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.SMARTLINK_API_KEY,
      "X-Skip-Sync": "1",
    },
    body: JSON.stringify({
      title: "Релиз",
      artist_name: "Артист",
      owner: { tg_user_id: "1" },
    }),
  });

  const patchResponse = await request(env, "/api/index/patch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.SMARTLINK_API_KEY,
      "X-Skip-Sync": "1",
    },
    body: JSON.stringify({
      artist_slug: "artist",
      slug: "reliz",
      owner_tg_user_id: "1",
      patch: {
        title: "Релиз (обновлено)",
        links: { vk: "https://vk.com/music/0" },
      },
    }),
  });

  assert.equal(patchResponse.status, 200);
  const patchPayload = await patchResponse.json();
  assert.equal(patchPayload.ok, true);
});

test("index/my returns only owner entries", async () => {
  const env = buildEnv();
  await request(env, "/api/index/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.SMARTLINK_API_KEY,
      "X-Skip-Sync": "1",
    },
    body: JSON.stringify({
      title: "Первый",
      artist_name: "Артист",
      owner: { tg_user_id: "1" },
    }),
  });
  await request(env, "/api/index/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.SMARTLINK_API_KEY,
      "X-Skip-Sync": "1",
    },
    body: JSON.stringify({
      title: "Второй",
      artist_name: "Артист",
      owner: { tg_user_id: "2" },
    }),
  });

  const ownedRecords = [...env.DB.records.values()].filter(
    (record) => record.owner_tg_user_id === "1",
  );
  assert.equal(ownedRecords.length, 1);

  const response = await request(env, "/api/index/my?owner_tg_user_id=1", {
    method: "GET",
    headers: { "X-API-Key": env.SMARTLINK_API_KEY },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].title, "Первый");
});

test("api/my requires SMARTLINK_API_KEY", async () => {
  const env = buildEnv();
  env.SMARTLINK_API_KEY = undefined;
  const response = await request(env, "/api/my?owner_tg_user_id=1", {
    method: "GET",
    headers: { Authorization: "Bearer test-key" },
  });

  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error, "missing_env");
});

test("artist page shows copy button for empty state", async () => {
  const env = buildEnv();
  const response = await request(env, "/artist/ghost", { method: "GET" });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Поделиться/);
  assert.match(html, /data-url="https:\/\/go\.test\/artist\/ghost"/);
});

test("release page uses artist_name and title in UI", async () => {
  const env = buildEnv();
  await request(env, "/api/index/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.SMARTLINK_API_KEY,
      "X-Skip-Sync": "1",
    },
    body: JSON.stringify({
      title: "Тестовый релиз",
      artist_name: "Тестовый артист",
      owner: { tg_user_id: "1" },
    }),
  });

  const response = await request(env, "/testovyy-artist/testovyy-reliz", { method: "GET" });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Тестовый релиз/);
  assert.match(html, /Тестовый артист/);
});
