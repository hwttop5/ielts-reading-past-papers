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

## 修改约束

- 改动 API 行为、路由、响应模式或运行模式时，优先补/跑 `server/test/**/*.test.ts`。
- 涉及 RAG、嵌入模型、Qdrant 或路由策略说明时，以 `src/config/env.ts` 的当前逻辑为准。
- 不要把根 README 当作服务端维护手册；服务端执行说明应保留在本目录文档或根 `AGENTS.md`。
