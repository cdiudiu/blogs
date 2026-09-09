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
      "SELECT title, summary, cover, date, category, series FROM posts WHERE id = ?"
    ).bind(postId).first();

    if (!post) {
      return new Response("文章不存在", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    // 2. 服务端从 R2 提取正文文本进行预渲染
    let serverPreRender = '';
    try {
      const mdObject = await env.MY_BUCKET.get(`posts/${postId}.md`);
      if (mdObject) {
        const rawMarkdown = await mdObject.text();
        // 过滤部分 Markdown 标点，提取首段核心纯文本用于 SEO 直出
        const cleanText = rawMarkdown.replace(/[#*`>~-]/g, '').trim();
        serverPreRender = `<div class="seo-ssr-summary prose prose-zinc leading-relaxed text-zinc-600 mb-6">${cleanText.slice(0, 1000)}...</div>`;
      }
    } catch (_) { }

    // 3. 字段规范化
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

    // 4. 构建 BlogPosting 结构化数据
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

    // 5. 构建 BreadcrumbList 面包屑数据
    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "首页",
          "item": new URL("/", request.url).href
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": post.series || "默认系列",
          "item": `${new URL("/", request.url).href}#/series/${encodeURIComponent(post.series || '')}`
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": post.title || "正文",
          "item": currentUrl
        }
      ]
    };

    // 结构化数据打包并输出至 head
    const jsonLdScript = `
    <script type="application/ld+json">${JSON.stringify(schemaData)}</script>
    <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>`;

    // 6. 构造元数据标签
    const metaTags = `
    <title>${title} - VPS帮帮车</title>
    <meta name="description" content="${summary}">
    <link rel="dns-prefetch" href="https://images.vpsbbc.com">
    <link rel="preconnect" href="https://images.vpsbbc.com" crossorigin>
    <link rel="dns-prefetch" href="https://cdnjs.cloudflare.com">
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
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

    // 7. 拉取 SPA 模版并通过 HTMLRewriter 流式注入
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
      })
      // 将服务端预提取的摘要直出到文章正文容器中，消除爬虫眼里的空内容
      .on('article#post-content', {
        element(e) {
          if (serverPreRender) {
            e.setInnerContent(serverPreRender, { html: true });
          }
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