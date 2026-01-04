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

function renderSmartlink(artist: string, slug: string): Response {
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SREDA Smartlink</title>
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
      width: min(540px, 100%);
      background: rgba(16, 24, 40, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      padding: 2.5rem;
      backdrop-filter: blur(6px);
    }
    h1 {
      margin: 0 0 1rem;
      font-size: 2rem;
      letter-spacing: 0.02em;
      color: #f4f6fb;
    }
    .meta {
      margin: 0.35rem 0;
      font-size: 1rem;
      color: #b9c1d6;
    }
    .meta span {
      color: #f3b266;
      font-weight: 600;
    }
    .actions {
      margin-top: 2rem;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
    }
    .primary-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.95rem 1.25rem;
      border-radius: 12px;
      border: none;
      background: linear-gradient(135deg, #ff9f3f, #ff635f);
      color: #0c0c0f;
      font-weight: 700;
      text-decoration: none;
      transition: transform 120ms ease, box-shadow 120ms ease;
      box-shadow: 0 12px 24px rgba(255, 132, 92, 0.35);
    }
    .primary-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 18px 30px rgba(255, 132, 92, 0.4);
    }
    .secondary-link {
      color: #8fb4ff;
      text-decoration: none;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .secondary-link:hover {
      color: #bcd4ff;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>SREDA Smartlink</h1>
    <p class="meta">artist: <span>${escapeHtml(artist)}</span></p>
    <p class="meta">slug: <span>${escapeHtml(slug)}</span></p>
    <div class="actions">
      <a class="primary-button" href="https://t.me/iskramusic_bot" target="_blank" rel="noopener noreferrer">⚡ Открыть ИСКРУ в Telegram</a>
      <a class="secondary-link" href="https://t.me/sreda_music" target="_blank" rel="noopener noreferrer">📰 Обновления проекта</a>
    </div>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
    },
  });
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
    },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") {
      return notFound();
    }

    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/health") {
      return new Response("OK: sreda-go", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=UTF-8",
        },
      });
    }

    if (segments.length === 2) {
      const [artist, slug] = segments.map((segment) => decodeURIComponent(segment));
      return renderSmartlink(artist, slug);
    }

    return notFound();
  },
};
