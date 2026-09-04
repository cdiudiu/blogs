// 统一的通用错误/不存在提示模板
export function renderErrorPage({ title, message, status = 404 }) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${status}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #f7f9fb;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      color: #3f3f46;
    }
    .card {
      background: #ffffff;
      padding: 40px;
      border-radius: 20px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
      text-align: center;
      max-width: 400px;
      width: 90%;
      border: 1px solid #f4f4f5;
    }
    .icon { font-size: 44px; margin-bottom: 16px; }
    h1 { font-size: 18px; font-weight: 700; color: #18181b; margin: 0 0 8px 0; }
    p { font-size: 13px; color: #71717a; line-height: 1.6; margin: 0 0 24px 0; }
    a {
      display: inline-block;
      padding: 9px 22px;
      background-color: #18181b;
      color: #ffffff;
      text-decoration: none;
      font-size: 12px;
      font-weight: 600;
      border-radius: 10px;
      transition: opacity 0.2s;
    }
    a:hover { opacity: 0.85; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${status === 404 ? '🔍' : '⚠️'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="/">返回首页</a>
  </div>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache"
    }
  });
}

// 全局请求过滤中间件
export async function onRequest(context) {
  try {
    const response = await context.next();

    // 仅拦截 HTML 页面请求产生的 404（排除正常的前端图片、js 等静态资源）
    const accept = context.request.headers.get("Accept") || "";
    if (response.status === 404 && accept.includes("text/html")) {
      return renderErrorPage({
        title: "页面或资源不存在",
        message: "你访问的链接可能已被更改、删除，或输入的路径不正确。",
        status: 404
      });
    }

    return response;
  } catch (err) {
    return renderErrorPage({
      title: "服务暂时不可用",
      message: "边缘节点处理请求时出现异常，请稍后刷新重试。",
      status: 500
    });
  }
}