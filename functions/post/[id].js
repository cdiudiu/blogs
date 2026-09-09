function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttrUrl(url) {
  if (!url) return '';
  return url.replace(/"/g, '&quot;').replace(/</g, '').replace(/>/g, '');
}

export async function onRequest(context) {
  const { request, params, env } = context;
  const postId = params.id;

  try {
    // 1. 查询 D1 数据库获取文章元数据
    const post = await env.DB.prepare(
      "SELECT title, summary, cover, date, category FROM posts WHERE id = ?"
    ).bind(postId).first();

    if (!post) {
      return new Response("文章不存在", { status: 404 });
    }

    // 2. 字段规范化
    const title = escapeHtml(post.title || '文章详情');
    const summary = escapeHtml(post.summary || '');
    const datePublished = post.date || new Date().toISOString().split('T')[0];
    const category = escapeHtml(post.category || '未分类');

    let cover = (post.cover || '').trim();
    if (cover && !cover.startsWith('http://') && !cover.startsWith('https://')) {
      try {
        cover = new URL(cover, request.url).href;
      } catch (_) {
        cover = '';
      }
    }
    const safeCover = escapeAttrUrl(cover);
    const currentUrl = escapeAttrUrl(request.url);

    // 3. 构建 Article/BlogPosting 专用的 JSON-LD 结构化数据
    const schemaData = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": post.title || '文章详情',
      "description": post.summary || '',
      "url": request.url,
      "datePublished": datePublished,
      "dateModified": datePublished,
      "articleSection": post.category || '未分类',
      "author": {
        "@type": "Person",
        "name": "VPS帮帮车"
      },
      "publisher": {
        "@type": "Organization",
        "name": "VPS帮帮车",
        "url": new URL("/", request.url).href
      }
    };

    if (cover) {
      schemaData.image = [cover];
    }

    const jsonLdScript = `\n    <script type="application/ld+json">${JSON.stringify(schemaData)}</script>\n`;

    // 4. 构建 Meta 标签
    const metaTags = `
    <title>${title} - VPS帮帮车</title>
    <meta name="description" content="${summary}">
    <link rel="canonical" href="${currentUrl}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${summary}">
    ${safeCover ? `<meta property="og:image" content="${safeCover}">` : ''}
    <meta property="og:url" content="${currentUrl}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${summary}">
    ${safeCover ? `<meta name="twitter:image" content="${safeCover}">` : ''}
    ${jsonLdScript}
    `;

    // 5. 获取根 index.html 并通过 HTMLRewriter 注入
    const assetResponse = await env.ASSETS.fetch(new URL("/", request.url));
    const rewriter = new HTMLRewriter()
      .on('title', { element(e) { e.remove(); } })
      .on('meta[name="description"]', { element(e) { e.remove(); } })
      .on('meta[property^="og:"]', { element(e) { e.remove(); } })
      .on('meta[name^="twitter:"]', { element(e) { e.remove(); } })
      .on('link[rel="canonical"]', { element(e) { e.remove(); } })
      .on('head', {
        element(e) {
          e.append(metaTags, { html: true });
        }
      });

    const transformedResponse = rewriter.transform(assetResponse);
    const headers = new Headers(transformedResponse.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=60");

    return new Response(transformedResponse.body, {
      status: transformedResponse.status,
      headers
    });

  } catch (err) {
    return env.ASSETS.fetch(request);
  }
}