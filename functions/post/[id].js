function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function onRequest(context) {
  const { request, params, env } = context;
  const postId = params.id;

  try {
    // 1. 查询 D1 数据库
    const post = await env.DB.prepare(
      "SELECT title, summary, cover FROM posts WHERE id = ?"
    ).bind(postId).first();

    // 找不到文章直接交付原始静态资源
    if (!post) {
      return env.ASSETS.fetch(request);
    }

    // 2. 准备动态字段
    const title = escapeHtml(post.title || '文章详情');
    const summary = escapeHtml(post.summary || '');
    
    let cover = post.cover || '';
    if (cover && !cover.startsWith('http://') && !cover.startsWith('https://')) {
      cover = new URL(cover, request.url).href;
    }
    cover = escapeHtml(cover);
    const currentUrl = escapeHtml(request.url);

    // 有图片时使用大图卡片
    const twitterCard = cover ? 'summary' : 'summary';

    // 3. 构建需要注入的 Meta 标签
    const metaTags = `
    <title>${title}</title>
    <meta name="description" content="${summary}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${summary}">
    ${cover ? `<meta property="og:image" content="${cover}">` : ''}
    <meta property="og:url" content="${currentUrl}">
    <meta name="twitter:card" content="${twitterCard}">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${summary}">
    ${cover ? `<meta name="twitter:image" content="${cover}">` : ''}
    `;

    // 4. 获取 SPA 入口 HTML
    const assetResponse = await env.ASSETS.fetch(new URL("/", request.url));

    // 5. 使用 HTMLRewriter 移除旧标签并追加新标签
    const rewriter = new HTMLRewriter()
      .on('title', { element(e) { e.remove(); } })
      .on('meta[name="description"]', { element(e) { e.remove(); } })
      .on('meta[property^="og:"]', { element(e) { e.remove(); } })
      .on('meta[name^="twitter:"]', { element(e) { e.remove(); } })
      .on('head', {
        element(e) {
          e.append(metaTags, { html: true });
        }
      });

    const transformedResponse = rewriter.transform(assetResponse);

    // 6. 返回带有适当缓存控制的响应
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