// 简单的管理员密码校验（与原逻辑保持一致）
async function verifyPassword(password, env) {
  try {
    const row = await env.DB.prepare("SELECT value FROM config WHERE key = 'admin_password'").first();
    if (row && row.value) return password === row.value;
  } catch (e) {}
  return password === env.ADMIN_PASSWORD;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response("缺少文章 ID", { status: 400 });
  }

  try {
    // 1. 查询 D1 检查文章状态
    const postMeta = await env.DB.prepare(
      "SELECT status FROM posts WHERE id = ?"
    ).bind(id).first();

    if (!postMeta) {
      return new Response("文章不存在", { status: 404 });
    }

    // 2. 如果是草稿，强制校验管理员身份
    if (postMeta.status === "draft") {
      const authHeader = request.headers.get("Authorization");
      const isAdmin = await verifyPassword(authHeader, env);
      if (!isAdmin) {
        return new Response("该文章为私密草稿，无权访问", { status: 403 });
      }
    }

    // 3. 服务端直接从 R2 私有桶读取正文，不经过公网
    const object = await env.MY_BUCKET.get(`posts/${id}.md`);
    if (!object) {
      return new Response("正文文件未找到", { status: 404 });
    }

    const content = await object.text();
    return new Response(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": postMeta.status === "publish" ? "public, max-age=300" : "no-store"
      }
    });

  } catch (err) {
    return new Response("读取文章失败: " + err.message, { status: 500 });
  }
}