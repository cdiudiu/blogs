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

    if (!post) {
      return env.ASSETS.fetch(request);
    }

    // 2. 获取原始 index.html
    const indexResponse = await env.ASSETS.fetch(new URL("/", request.url));
    let html = await indexResponse.text();

    const title = escapeHtml(post.title || '文章详情');
    const summary = escapeHtml(post.summary || '');
    
    // 确保封面图片为完整 URL
    let cover = post.cover || '';
    if (cover && !cover.startsWith('http://') && !cover.startsWith('https://')) {
      cover = new URL(cover, request.url).href;
    }
    cover = escapeHtml(cover);

    const currentUrl = escapeHtml(request.url);

    // 3. 清理已有的同名标签，防止重复冲突
    html = html
      .replace(/<title>[\s\S]*?<\/title>/i, '')
      .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
      .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
      .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '');

    // 4. 组装新 Meta 标签
    const metaTags = `
    <title>${title}</title>
    <meta name="description" content="${summary}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${summary}">
    ${cover ? `<meta property="og:image" content="${cover}">` : ''}
    <meta property="og:url" content="${currentUrl}">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${summary}">
    ${cover ? `<meta name="twitter:image" content="${cover}">` : ''}
    `;

    html = html.replace('</head>', `${metaTags}\n</head>`);

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60"
      }
    });

  } catch (err) {
    return env.ASSETS.fetch(request);
  }
}