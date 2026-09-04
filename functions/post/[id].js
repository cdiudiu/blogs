export async function onRequest(context) {
  const { request, params, env } = context;
  const postId = params.id;

  try {
    // 1. 从 D1 数据库查询文章元数据
    const post = await env.DB.prepare(
      "SELECT title, summary, cover FROM posts WHERE id = ?"
    ).bind(postId).first();

    if (!post) {
      return env.ASSETS.fetch(request);
    }

    // 2. 获取原始 index.html
    const indexResponse = await env.ASSETS.fetch(new URL("/", request.url));
    let html = await indexResponse.text();

    const title = post.title ? post.title.replace(/"/g, '&quot;') : '文章详情';
    const summary = post.summary ? post.summary.replace(/"/g, '&quot;') : '';
    const cover = post.cover || '';
    const currentUrl = request.url;

    // 清理掉原有的 <title> 标签，防止冲突
    html = html.replace(/<title>[\s\S]*?<\/title>/i, '');

// 将原先的 summary_large_image 替换为 summary
    const metaTags = `
    <title>${title}</title>
    <meta name="description" content="${summary}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${summary}">
    <meta property="og:image" content="${cover}">
    <meta property="og:url" content="${currentUrl}">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${summary}">
    <meta name="twitter:image" content="${cover}">
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