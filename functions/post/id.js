export async function onRequest(context) {
  const { request, params, env } = context;
  const postId = params.id;

  try {
    // 1. 从 D1 数据库查询当前文章的元数据
    const post = await env.DB.prepare(
      "SELECT title, summary, cover FROM posts WHERE id = ?"
    ).bind(postId).first();

    // 2. 如果文章不存在，直接继续走默认静态资源分发
    if (!post) {
      return env.ASSETS.fetch(request);
    }

    // 3. 读取站点的原始 index.html
    const indexResponse = await env.ASSETS.fetch(new URL("/", request.url));
    let html = await indexResponse.text();

    const title = post.title ? post.title.replace(/"/g, '&quot;') : '文章详情';
    const summary = post.summary ? post.summary.replace(/"/g, '&quot;') : '';
    const cover = post.cover || '';
    const currentUrl = request.url;

    // 4. 构建针对 X (Twitter) 和 OpenGraph 的元标签
    const metaTags = `
    <!-- 动态注入社交卡片元标签 -->
    <title>${title}</title>
    <meta name="description" content="${summary}">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="article">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${summary}">
    <meta property="og:image" content="${cover}">
    <meta property="og:url" content="${currentUrl}">

    <!-- Twitter / X Card (summary 为类似截图的小图左置样式，可改为 summary_large_image) -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${summary}">
    <meta name="twitter:image" content="${cover}">
    `;

    // 5. 替换 HTML 中的 head 标签，将 meta 注入进去
    html = html.replace('</head>', `${metaTags}\n</head>`);

    // 6. 返回带有完整 Meta 信息的 HTML
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60"
      }
    });

  } catch (err) {
    // 异常时回退到默认静态资源
    return env.ASSETS.fetch(request);
  }
}