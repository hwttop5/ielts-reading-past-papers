# Docker 自托管部署

本文档描述本仓库在 Linux 服务器上的 Docker 全栈部署方式：前端静态站点、Fastify 助教 API、Qdrant、Nginx HTTPS 单入口，以及首次灌库流程。

## 1. 前置条件

- Linux 服务器
- 已安装 Docker Engine 与 Docker Compose Plugin
- 域名已解析到服务器
- 已准备证书文件：
  - `deploy/certs/fullchain.pem`
  - `deploy/certs/privkey.pem`
- 已复制部署环境变量模板：

```bash
cp deploy/.env.example deploy/.env
```

前端构建期变量不读取 `deploy/.env`。如需启用百度统计，请在仓库根目录 `.env`、Shell 环境变量或 CI 环境变量中设置统计 ID 后重新构建前端镜像：

```bash
VITE_BAIDU_TONGJI_ID=your-baidu-tongji-id
docker compose build web
docker compose up -d web
```

可选：也可以直接使用仓库脚本代替原始 `docker compose` 命令。

## 2. 必填环境变量

编辑 `deploy/.env`，至少填写：

- `FRONTEND_ORIGIN`
- `LLM_API_KEY`
- `EMBEDDING_BASE_URL`
- `EMBEDDING_API_KEY`
- `EMBEDDING_MODEL`

说明：

- `QDRANT_URL` 不需要手填，`docker-compose.yml` 已固定注入为 `http://qdrant:6333`
- 若缺少 `EMBEDDING_*` 或兼容的 `OPENAI_*` 配置，服务仍可启动，但不会具备完整 RAG 检索能力

## 3. 启动主栈

```bash
docker compose build
docker compose up -d
docker compose ps
```

对应脚本：

```bash
npm run docker:selfhost:build
npm run docker:selfhost:up
npm run docker:selfhost:ps
```

查看日志：

```bash
docker compose logs --tail=200 web
docker compose logs --tail=200 server
docker compose logs --tail=200 qdrant
```

## 4. 首次灌库

首次部署必须执行灌库。建议先用小样本验证，再执行全量。

小样本验证：

```bash
docker compose run --rm server node dist/cli/ingest.js --limit=5
```

全量灌库：

```bash
docker compose run --rm server node dist/cli/ingest.js
```

也可以使用：

```bash
npm run docker:selfhost:ingest
```

题库更新后，也需要重新执行灌库。

## 5. 验收

健康检查：

```bash
curl -I http://your-domain.example/healthz
curl https://your-domain.example/health
```

部署脚本校验：

```bash
node scripts/check-deployment.mjs https://your-domain.example
```

通过后应确认：

- `docker compose ps` 中 `web`、`server`、`qdrant` 为健康状态
- `/health` 返回 `status: ok`
- 灌库完成后，`semanticSearchConfigured` 为 `true`
- 实际助教查询可用，流式响应正常

## 6. 升级

```bash
git pull
docker compose build
docker compose up -d
```

如果题库或 RAG 数据依赖发生变化，重跑灌库：

```bash
docker compose run --rm server node dist/cli/ingest.js
```

## 7. 回滚

推荐做法：

- 保留上一版 git commit 或镜像 tag
- 切回旧版本后重新构建并拉起
- 默认不要删除 `qdrant_storage` 卷

回滚后重启：

```bash
docker compose build
docker compose up -d
```

只有在明确要重建向量数据时，才删除 Qdrant 数据卷并重新灌库。
