# AGENTS.md

本文件仅补充 `server/` 目录的局部规则；未提及事项继承仓库根目录 `AGENTS.md`。

## 目录职责

- `src/`：Fastify 助教 API 源码
- `test/`：服务端 Vitest 测试
- `.env.example`：环境变量模板
- `src/config/env.ts`：环境变量解析、默认值与运行模式判断

## 常用命令

```bash
npm --prefix server run dev
npm --prefix server run build
npm --prefix server run test
npm --prefix server run ingest
npm --prefix server run check:index
npm --prefix server run generate:similar
npm --prefix server run check:similar
```

## 环境变量事实源

- 模板与注释：`server/.env.example`
- 运行时默认值、兼容逻辑与校验：`server/src/config/env.ts`

写文档时优先以这两个文件为准，不要手写与代码不一致的变量说明。

## 消息通知维护约定

- 公告上游源固定为 GitHub issue `hwttop5/github-actions#1`，服务端入口见 `src/lib/contactAd.ts`。
- issue 标题直接作为公告标题；issue 正文直接作为 Markdown 公告正文；公告时间与镜像版本直接取 GitHub Issue API 的 `updated_at`。
- issue 正文去空白后为空时，服务端写入隐藏快照并返回 `{ enabled: false }`；不再依赖 `enabled/title/updatedAt` frontmatter 控制显示。
- 页面运行时永远只读本地镜像：`GET /api/contact-ad` 只返回本地 `snapshot.json`，`GET /api/contact-ad/assets/:assetId` 只返回本地缓存图片，不在请求路径直接抓 GitHub。
- 本地镜像缓存根目录位于 `SYNC_DATABASE_PATH` 同级的 `contact-ad-cache/`；镜像主文件为 `snapshot.json`，图片缓存位于 `assets/`。
- 服务端启动后会立即检查一次上游，并每 5 分钟继续检查；只有 `updated_at` 版本变化时才刷新本地镜像。
- issue 正文里的 `https://github.com/user-attachments/assets/...` 图片会被下载到本地缓存，并改写为 `/api/contact-ad/assets/:assetId` 供前端弹窗展示。
- 前端右上角“消息通知”按钮和自动弹窗继续复用现有接口返回的 `enabled/title/markdown/updatedAt`，不要把展示规则重新分散到前端硬编码。
- 调整公告链路后，优先验证 `server/test/contact-ad.route.test.ts`，再看本地 `/api/contact-ad` 返回值和 `contact-ad-cache/` 内容是否符合预期。

## 修改约束

- 改动 API 行为、路由、响应模式或运行模式时，优先补/跑 `server/test/**/*.test.ts`。
- 涉及 RAG、嵌入模型、Qdrant 或路由策略说明时，以 `src/config/env.ts` 的当前逻辑为准。
- 不要把根 README 当作服务端维护手册；服务端执行说明应保留在本目录文档或根 `AGENTS.md`。
