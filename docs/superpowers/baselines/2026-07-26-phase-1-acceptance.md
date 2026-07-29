# 2026-07-26 第一阶段本地验收记录

## 验收范围

本记录覆盖第一阶段“核心修复与跑腿下线”的当前 `dev` 工作区：

- 历史用户名和头像展示快照同步、统一默认头像。
- 统一授权登录弹框及“登录后需再次点击”规则。
- 小区市场游客公开查询与登录个性化查询。
- “我的任务”Tab 一次返回及异步请求并发保护。
- 小区跑腿小程序、API、后台和接口文档下线，以及旧深链兜底。
- 第一阶段正式功能文档、发布前自测清单和 API 文档语义。

第二至第四阶段的 RxJS 热搜、列表行数统一、通知中心、意见反馈精简、接口日志和接口管理不在本次完成范围内。

## 代码与分支边界

| 仓库 | 分支 | HEAD | 相对 `origin/dev` |
| --- | --- | --- | --- |
| `intelligent-community` | `dev` | `8ee1e2e505ea1c312c6f409a805c200bbae03f08` | 领先 2、落后 0 |
| `intelligent-community-admin` | `dev` | `36d846a1e62c66e7bd050f5ae2b32fea235f5084` | 领先 1、落后 0 |
| `intelligent-community-admin-web` | `dev` | `3dc33d91b03b724512ea21b7855d68e7265fdff8` | 领先 0、落后 0 |

三个仓库均保留当前未提交改动。本次未提交、未推送、未合并、未部署。

## 验证结果

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 小程序全部 Node 测试 | `node --test test/*.test.js` | PASS：9/9，失败 0 |
| 小程序生产回归守卫 | `node test/production-regressions.js` | PASS：输出 `production regression guards passed` |
| 小程序全仓 ESLint | `npx eslint ./ --no-eslintrc -c ./.eslintrc.js --format json --output-file /private/tmp/phase1-eslint-current.json` | 历史基线仍使命令返回非零；当前 4537 errors、0 warnings，低于基线 4544/0 |
| 小程序零新增 lint 比较 | 使用下方“零新增 lint 完整复现”命令 | PASS：新增指纹 0 |
| API 全部测试 | `node --import tsx --test test/*.spec.ts` | PASS：73/73，失败 0 |
| API ESLint | `npm run lint` | PASS：退出码 0，0 warnings |
| Prisma schema 校验 | `npx dotenv -e .env.development -e .env -- prisma validate --schema prisma/schema.prisma` | PASS：schema valid |
| Prisma Client 生成 | `npm run prisma:generate` | PASS：Prisma Client 6.19.3 生成成功 |
| 迁移 SQL 静态回归 | `node --import tsx --test test/user-profile-snapshots.spec.ts test/errand-removal.spec.ts` | PASS：26/26；覆盖字段、论坛主帖等历史回填、NULL 头像策略、索引、精确删表及外键顺序 |
| API TypeScript 构建 | `npm run build` | PASS |
| 后台 Web 构建 | `npm run build` | PASS；Vite 仅提示主 chunk 大于 500 kB，不阻塞构建 |
| 三仓差异检查 | 从工作区根目录依次执行 `git -C intelligent-community diff --check`、`git -C intelligent-community-admin diff --check`、`git -C intelligent-community-admin-web diff --check` | PASS |

## 零新增 lint 完整复现

以下命令从 `intelligent-community` 仓库根目录执行。第一条会因为历史存量错误返回非零，但仍会生成完整 JSON；第二条进行基线计数和五元组比较，新指纹不为 0 时返回非零。

```bash
npx eslint ./ --no-eslintrc -c ./.eslintrc.js --format json --output-file /private/tmp/phase1-eslint-current.json
node -e 'const fs=require("fs");const path=require("path");const base=JSON.parse(fs.readFileSync("docs/superpowers/baselines/2026-07-26-eslint-baseline.json","utf8"));const current=JSON.parse(fs.readFileSync("/private/tmp/phase1-eslint-current.json","utf8"));const key=(file,message)=>[path.relative(process.cwd(),file.filePath),message.ruleId??"",message.line??"",message.column??"",message.message].join("\u001f");const baselineKeys=new Set(base.flatMap(file=>file.messages.map(message=>key(file,message))));const currentMessages=current.flatMap(file=>file.messages.map(message=>({file,message})));const newFingerprints=currentMessages.filter(({file,message})=>!baselineKeys.has(key(file,message)));const count=files=>files.reduce((sum,file)=>({errors:sum.errors+file.errorCount,warnings:sum.warnings+file.warningCount}),{errors:0,warnings:0});console.log(JSON.stringify({baseline:count(base),current:count(current),newFingerprints:newFingerprints.length},null,2));if(newFingerprints.length)process.exit(2);'
```

## 数据库证据边界

- 本次只执行了 Prisma schema 校验、Prisma Client 生成和迁移 SQL 静态测试。
- 未执行 `prisma migrate dev`、`prisma migrate deploy` 或任何直接数据库写入。
- `20260726090000_add_author_avatar_snapshots` 与 `20260726100000_remove_errand_module` 仅表示迁移文件已准备，不表示任一数据库已应用迁移。
- 后续必须在明确的专用开发/测试数据库完成备份后执行，并按《发布前自测清单》验证论坛主帖等历史数据回填、头像快照可空与双层显示兜底、精确删表和其他模块回归。

## 验收结论

第一阶段代码和文档通过当前本地静态测试、构建及零新增 lint 门槛，可进入后续代码评审和专用测试环境迁移/体验版验收。该结论不等于已经发布，也不包含第二至第四阶段功能。
