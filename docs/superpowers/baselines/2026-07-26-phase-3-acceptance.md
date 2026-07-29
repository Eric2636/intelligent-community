# 2026-07-26 第三阶段本地验收记录

## 验收范围

本记录覆盖第三阶段消息通知中心以及第一、第二阶段回归，范围为当前三个 `dev` 工作区：

- 论坛帖子回复、评论回复通知。
- 任务领取、放弃、提交、确认、驳回、取消通知。
- 市场下单、取消、完成通知及下单幂等。
- 超级管理员向全部启用用户发布系统通知。
- 用户通知分页、未读数、单条/全部已读、业务跳转和软删除。
- 小程序“我的”与自定义底栏未读数、TDesign 左滑删除交互。
- 数据模型、OpenAPI、后台页面、正式文档和事件清单。

点赞和收藏通知不在本阶段范围内。第四阶段全接口日志和接口管理仍未实现，不因本记录而改变状态。

## 代码、分支与发布边界

| 仓库 | 分支 | HEAD | 相对 `origin/dev` |
| --- | --- | --- | --- |
| `intelligent-community` | `dev` | `8ee1e2e505ea1c312c6f409a805c200bbae03f08` | 领先 2、落后 0 |
| `intelligent-community-admin` | `dev` | `36d846a1e62c66e7bd050f5ae2b32fea235f5084` | 领先 1、落后 0 |
| `intelligent-community-admin-web` | `dev` | `3dc33d91b03b724512ea21b7855d68e7265fdff8` | 领先 0、落后 0 |

三个仓库均保留当前未提交改动。本次未提交、未推送、未合并、未部署、未上传小程序版本，也未执行数据库迁移。

## Fresh 验证结果

| 项目 | 结果 |
| --- | --- |
| 小程序全部 JavaScript 测试 | PASS：39/39，失败 0 |
| 小程序全部 TypeScript 测试 | PASS：36/36，失败 0 |
| 小程序生产回归守卫 | PASS：输出 `production regression guards passed` |
| 小程序全仓 ESLint | 历史基线仍使命令返回非零；当前 4536 errors、0 warnings，低于基线 4544/0 |
| 小程序零新增 lint 比较 | PASS：新增五元组指纹 0 |
| API 全部测试 | PASS：193/193，失败 0 |
| API ESLint | PASS：退出码 0 |
| API TypeScript 构建 | PASS |
| Prisma 格式检查 | PASS：在临时副本执行 `prisma format` 后与仓库 schema 完全一致，未改动正式文件 |
| Prisma schema 校验 | PASS：`prisma/schema.prisma` valid |
| Prisma Client 生成 | PASS：Prisma Client 6.19.3 |
| from-empty schema 静态演练 | PASS：`prisma migrate diff --from-empty --to-schema-datamodel ... --script` 成功生成完整 SQL |
| 迁移目录与 SQL | PASS：仓库共 10 个迁移目录；本功能批次新增 4 个，所有 `migration.sql` 非空 |
| 后台 Web 全部 Node 测试 | PASS：17/17，失败 0 |
| 后台 Web 类型检查和构建 | PASS；Vite 仅提示主 chunk 大于 500 kB，不阻塞构建 |
| 三仓分支、状态和差异检查 | PASS：均为 `dev`；`git diff --check` 均退出 0 |
| 三仓 JSON 静态解析 | PASS：44 个 JSON 文件 |
| 小程序 WXML/LESS 静态检查 | PASS：30 个 WXML、31 个 LESS |
| 功能清单计数 | PASS：36 项；✅ 33、🚧 1、❌ 2 |
| `app.json` 页面统计 | PASS：主包 5、全部 subpackage 20、业务/公共分包 18、个人资料/设置 2、总计 25 |
| 消息事件文档契约 | PASS：12 种事件齐全，包含 actor、recipient、状态、biz、dedupe、自通知、事务、跳转、404、软删除和权限说明 |
| OpenAPI/路由 | PASS：5 个用户通知接口和 1 个超级管理员发布接口均已定义并注册 |
| 正式文档旧状态扫描 | PASS：正式功能文档不存在“通知占位/第三阶段未完成/三份迁移/旧 32-2-2 统计”；历史验收记录和计划中的 RED 预期保留原始时间语义 |

## 完整复现命令

以下命令均从 `/Users/chenglingyun/Documents/fuye-project` 开始执行。

### 小程序测试、生产守卫与 lint 基线

```bash
cd intelligent-community
node --test test/*.test.js
node --import tsx --test test/*.spec.ts
node test/production-regressions.js
npx eslint ./ --no-eslintrc -c ./.eslintrc.js --format json --output-file /private/tmp/phase3-eslint-current.json
node -e 'const fs=require("fs");const path=require("path");const base=JSON.parse(fs.readFileSync("docs/superpowers/baselines/2026-07-26-eslint-baseline.json","utf8"));const current=JSON.parse(fs.readFileSync("/private/tmp/phase3-eslint-current.json","utf8"));const key=(file,message)=>[path.relative(process.cwd(),file.filePath),message.ruleId??"",message.line??"",message.column??"",message.message].join("\u001f");const baselineKeys=new Set(base.flatMap(file=>file.messages.map(message=>key(file,message))));const currentMessages=current.flatMap(file=>file.messages.map(message=>({file,message})));const newFingerprints=currentMessages.filter(({file,message})=>!baselineKeys.has(key(file,message)));const count=files=>files.reduce((sum,file)=>({errors:sum.errors+file.errorCount,warnings:sum.warnings+file.warningCount}),{errors:0,warnings:0});const result={baseline:count(base),current:count(current),newFingerprints:newFingerprints.length,newFingerprintDetails:newFingerprints.slice(0,20).map(({file,message})=>({file:path.relative(process.cwd(),file.filePath),ruleId:message.ruleId,line:message.line,column:message.column,message:message.message}))};console.log(JSON.stringify(result,null,2));if(newFingerprints.length||result.current.errors>4544)process.exit(2);'
```

说明：ESLint 生成 JSON 的命令会因历史存量错误返回非零；必须继续执行指纹比较，且当前错误数不能超过 4544。

### API、Prisma 与迁移静态检查

```bash
cd ../intelligent-community-admin
node --import tsx --test test/*.spec.ts
npm run lint
npm run build
tmpdir=$(mktemp -d)
cp prisma/schema.prisma "$tmpdir/schema.prisma"
npx prisma format --schema "$tmpdir/schema.prisma"
cmp -s prisma/schema.prisma "$tmpdir/schema.prisma"
npx dotenv -e .env.development -e .env -- prisma validate --schema prisma/schema.prisma
npm run prisma:generate
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
find prisma/migrations -mindepth 1 -maxdepth 1 -type d | sort
for f in prisma/migrations/*/migration.sql; do test -s "$f" || exit 2; done
```

`tsx --test` 通过 `node --import tsx --test` 调用，避免沙箱环境的 IPC socket 限制。格式检查只格式化临时副本，不产生无关 schema 改动。

### 后台 Web

```bash
cd ../intelligent-community-admin-web
node --test test/*.spec.mjs
npm run build
```

### 三仓 Git、JSON、WXML、LESS 和文档契约

```bash
cd ..
for repo in intelligent-community intelligent-community-admin intelligent-community-admin-web; do
  git -C "$repo" branch --show-current
  git -C "$repo" rev-parse HEAD
  git -C "$repo" rev-list --left-right --count origin/dev...HEAD
  git -C "$repo" status --short --branch
  git -C "$repo" diff --check
done
cd intelligent-community
node -e 'const fs=require("fs"),path=require("path");const roots=[".","../intelligent-community-admin","../intelligent-community-admin-web"];const skip=new Set([".git","node_modules","dist","miniprogram_npm"]);let count=0;function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(skip.has(entry.name))continue;const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(entry.name.endsWith(".json")){JSON.parse(fs.readFileSync(p,"utf8"));count++;}}}for(const root of roots)walk(root);console.log(`JSON static parse passed: ${count} files across 3 repositories`);'
node -e 'const fs=require("fs"),path=require("path");const skip=new Set([".git","node_modules","dist","miniprogram_npm"]);const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(skip.has(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(wxml|less)$/.test(e.name))files.push(p)}}walk(".");let wxml=0,less=0;for(const file of files){const s=fs.readFileSync(file,"utf8");if(!s.trim())throw Error(`${file}: empty`);if(/^(<<<<<<<|=======|>>>>>>>)/m.test(s))throw Error(`${file}: conflict marker`);if(file.endsWith(".wxml")){wxml++;const opens=(s.match(/\{\{/g)||[]).length,closes=(s.match(/\}\}/g)||[]).length;if(opens!==closes)throw Error(`${file}: unbalanced moustache ${opens}/${closes}`)}else{less++;let depth=0;const clean=s.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/.*$/gm,"").replace(/(["\x27])(?:\\.|(?!\1)[^\\])*\1/g,"");for(const c of clean){if(c==="{")depth++;else if(c==="}")depth--;if(depth<0)throw Error(`${file}: extra closing brace`)}if(depth!==0)throw Error(`${file}: unbalanced braces ${depth}`)}}console.log(`WXML/LESS static checks passed: ${wxml} WXML, ${less} LESS`);'
node -e 'const fs=require("fs");const s=fs.readFileSync("FEATURE_STATUS.md","utf8");const rows=s.split("\n").filter(x=>/^\| .+ \| (✅|🚧|❌) \|/.test(x));const counts=rows.reduce((a,x)=>{const k=x.match(/\| (✅|🚧|❌) \|/)[1];a[k]=(a[k]||0)+1;return a},{});console.log(JSON.stringify({items:rows.length,counts},null,2));if(rows.length!==36||counts["✅"]!==33||counts["🚧"]!==1||counts["❌"]!==2)process.exit(2);'
node -e 'const a=require("./app.json");const main=a.pages.length;const sub=a.subpackages.map(x=>({root:x.root,count:x.pages.length}));const allSub=sub.reduce((n,x)=>n+x.count,0);const businessPublic=sub.filter(x=>x.root.startsWith("package")).reduce((n,x)=>n+x.count,0);const result={main,subpackageDeclarations:sub.length,allSub,businessPublic,personalSettings:allSub-businessPublic,total:main+allSub};console.log(JSON.stringify(result,null,2));if(JSON.stringify(result)!==JSON.stringify({main:5,subpackageDeclarations:6,allSub:20,businessPublic:18,personalSettings:2,total:25}))process.exit(2);'
```

## 环境待验项

以下项目未在当前本地环境完成，因此本记录不能替代体验版/真机验收：

1. 微信开发者工具服务端口未获授权；未执行“工具 → 构建 npm”，尚未确认构建后的 `rxjs`/TDesign 解析和主包、分包体积。
2. 未在 320px、375px、430px 三档模拟器或真机完成页面视觉检查。
3. TDesign SwipeCell 的仿 iOS/微信列表左滑仍需真机确认手势、滚动冲突和删除按钮点击区域。

## 数据库证据边界

- 本次只执行 Prisma 格式临时副本对比、schema 校验、Client 生成、from-empty SQL 生成和迁移静态测试。
- 仓库现有 10 个迁移目录；本轮功能新增 4 份：作者/头像快照、跑腿删表、纯文本反馈和通知中心。
- 未执行 `prisma migrate dev`、`prisma migrate deploy` 或任何直接数据库写入。
- 迁移文件存在不代表任何目标数据库已应用；执行前必须确认专用开发/测试数据库、备份和回滚方案。

## 验收结论

第三阶段代码和文档通过当前本地自动化测试、构建、静态检查和零新增 lint 门槛。数据库迁移、微信开发者工具 npm/包体、320/375/430 三档视觉和真机左滑仍待有权限的目标环境验收。本记录不等于已发布，第四阶段接口日志与接口管理仍未完成。
