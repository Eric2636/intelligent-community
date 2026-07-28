# 2026-07-26 第二阶段本地验收记录

## 验收范围

本记录覆盖第二阶段“界面、搜索与意见反馈”的当前三个 `dev` 工作区：

- 小程序任务、论坛、市场 RxJS 热搜索：trim、500ms 防抖、连续输入不查询、重复关键词不查询、空白恢复默认列表、latest-wins 竞态保护。
- 10 个小程序列表的标题 1 行、正文/摘要 3 行、省略和 Flex 宽度约束。
- “更多服务”只保留消息通知和意见反馈。
- 意见反馈只提交纯文本；要求登录且授权后不自动重放，需再次点击；trim 后限制 1–500 个 Unicode code points；不包含图片上传。
- 后台 5 个列表和登录支持普通 Enter；后台不改为热搜索；忽略 IME 组合态、keyCode 229 和长按重复键；列表请求采用 latest-wins。
- 第二阶段功能清单、功能说明、项目状态总结、快速启动、发布前自测清单、API README 和后台说明与实际行为同步。

第三阶段完整通知中心，以及第四阶段接口日志和接口管理不在本次完成范围内。

## 代码、分支与发布边界

| 仓库 | 分支 | HEAD | 相对 `origin/dev` |
| --- | --- | --- | --- |
| `intelligent-community` | `dev` | `8ee1e2e505ea1c312c6f409a805c200bbae03f08` | 领先 2、落后 0 |
| `intelligent-community-admin` | `dev` | `36d846a1e62c66e7bd050f5ae2b32fea235f5084` | 领先 1、落后 0 |
| `intelligent-community-admin-web` | `dev` | `3dc33d91b03b724512ea21b7855d68e7265fdff8` | 领先 0、落后 0 |

三个仓库均保留当前未提交改动。本次未提交、未推送、未合并、未部署，也未上传小程序版本。

## Fresh 验证结果

| 项目 | 结果 |
| --- | --- |
| 小程序全部 JavaScript 测试 | PASS：29/29，失败 0 |
| 小程序全部 TypeScript 测试 | PASS：11/11，失败 0 |
| 小程序生产回归守卫 | PASS：输出 `production regression guards passed` |
| 小程序全仓 ESLint | 历史基线仍使命令返回非零；当前 4537 errors、0 warnings，未超过基线 4544/0 |
| 小程序零新增 lint 比较 | PASS：新增五元组指纹 0 |
| API 全部测试 | PASS：78/78，失败 0 |
| API ESLint | PASS：退出码 0 |
| Prisma schema 校验 | PASS：`prisma/schema.prisma` valid |
| Prisma Client 生成 | PASS：Prisma Client 6.19.3 生成成功 |
| 迁移静态回归 | PASS：31/31；覆盖历史快照、跑腿精确删表和纯文本反馈迁移 |
| API TypeScript 构建 | PASS |
| 后台 Enter/latest-wins 测试 | PASS：10/10，失败 0 |
| 后台 Web 类型检查和构建 | PASS；Vite 仅提示主 chunk 大于 500 kB，不阻塞构建 |
| 三仓分支、状态和差异检查 | PASS：均为 `dev`；`git diff --check` 均退出 0 |
| 三仓 JSON 静态解析 | PASS：44 个 JSON 文件 |
| 小程序 WXML/LESS 静态检查 | PASS：30 个 WXML、31 个 LESS |
| 功能清单计数 | PASS：36 项；✅ 32、🚧 2、❌ 2 |
| `app.json` 页面统计 | PASS：主包 5、全部 subpackage 20、业务/公共分包 18、个人资料/设置 2、总计 25 |
| 正式文档一致性 | PASS：反馈、通知、更多服务、迁移、阶段状态和页面统计均与当前代码一致 |

## 完整复现命令

以下命令均从 `/Users/chenglingyun/Documents/fuye-project` 开始执行。

### 小程序

```bash
cd intelligent-community
node --test test/*.test.js
node --import tsx --test test/*.spec.ts
node test/production-regressions.js
npx eslint ./ --no-eslintrc -c ./.eslintrc.js --format json --output-file /private/tmp/phase2-eslint-current.json
node -e 'const fs=require("fs");const path=require("path");const base=JSON.parse(fs.readFileSync("docs/superpowers/baselines/2026-07-26-eslint-baseline.json","utf8"));const current=JSON.parse(fs.readFileSync("/private/tmp/phase2-eslint-current.json","utf8"));const key=(file,message)=>[path.relative(process.cwd(),file.filePath),message.ruleId??"",message.line??"",message.column??"",message.message].join("\u001f");const baselineKeys=new Set(base.flatMap(file=>file.messages.map(message=>key(file,message))));const currentMessages=current.flatMap(file=>file.messages.map(message=>({file,message})));const newFingerprints=currentMessages.filter(({file,message})=>!baselineKeys.has(key(file,message)));const count=files=>files.reduce((sum,file)=>({errors:sum.errors+file.errorCount,warnings:sum.warnings+file.warningCount}),{errors:0,warnings:0});console.log(JSON.stringify({baseline:count(base),current:count(current),newFingerprints:newFingerprints.length,newFingerprintDetails:newFingerprints.slice(0,20).map(({file,message})=>({file:path.relative(process.cwd(),file.filePath),ruleId:message.ruleId,line:message.line,column:message.column,message:message.message}))},null,2));if(newFingerprints.length||count(current).errors>4544)process.exit(2);'
```

说明：ESLint 生成 JSON 的命令会因历史存量错误返回非零，这是已记录的基线状态；必须继续执行后一条指纹比较命令，且当前错误数不得超过 4544。

### API、Prisma 与迁移静态回归

```bash
cd ../intelligent-community-admin
node --import tsx --test test/*.spec.ts
npm run lint
npx dotenv -e .env.development -e .env -- prisma validate --schema prisma/schema.prisma
npm run prisma:generate
node --import tsx --test test/user-profile-snapshots.spec.ts test/errand-removal.spec.ts test/feedback.spec.ts
npm run build
```

### 后台 Web

```bash
cd ../intelligent-community-admin-web
node --test test/*.spec.mjs
npm run build
```

### 三仓 Git、JSON、WXML 和 LESS 静态检查

```bash
cd ..
git -C intelligent-community branch --show-current
git -C intelligent-community rev-parse HEAD
git -C intelligent-community rev-list --left-right --count origin/dev...HEAD
git -C intelligent-community status --short --branch
git -C intelligent-community diff --check
git -C intelligent-community-admin branch --show-current
git -C intelligent-community-admin rev-parse HEAD
git -C intelligent-community-admin rev-list --left-right --count origin/dev...HEAD
git -C intelligent-community-admin status --short --branch
git -C intelligent-community-admin diff --check
git -C intelligent-community-admin-web branch --show-current
git -C intelligent-community-admin-web rev-parse HEAD
git -C intelligent-community-admin-web rev-list --left-right --count origin/dev...HEAD
git -C intelligent-community-admin-web status --short --branch
git -C intelligent-community-admin-web diff --check
cd intelligent-community
node -e 'const fs=require("fs"),path=require("path");const roots=[".","../intelligent-community-admin","../intelligent-community-admin-web"];const skip=new Set([".git","node_modules","dist","miniprogram_npm"]);let count=0;function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(skip.has(entry.name))continue;const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(entry.name.endsWith(".json")){JSON.parse(fs.readFileSync(p,"utf8"));count++;}}}for(const root of roots)walk(root);console.log(`JSON static parse passed: ${count} files across 3 repositories`);'
node -e 'const fs=require("fs"),path=require("path");const skip=new Set([".git","node_modules","dist","miniprogram_npm"]);const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(skip.has(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(wxml|less)$/.test(e.name))files.push(p)}}walk(".");let wxml=0,less=0;for(const file of files){const s=fs.readFileSync(file,"utf8");if(!s.trim())throw Error(`${file}: empty`);if(/^(<<<<<<<|=======|>>>>>>>)/m.test(s))throw Error(`${file}: conflict marker`);if(file.endsWith(".wxml")){wxml++;const opens=(s.match(/\{\{/g)||[]).length,closes=(s.match(/\}\}/g)||[]).length;if(opens!==closes)throw Error(`${file}: unbalanced moustache ${opens}/${closes}`)}else{less++;let depth=0;const clean=s.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/.*$/gm,"").replace(/(["\x27])(?:\\.|(?!\1)[^\\])*\1/g,"");for(const c of clean){if(c==="{")depth++;else if(c==="}")depth--;if(depth<0)throw Error(`${file}: extra closing brace`)}if(depth!==0)throw Error(`${file}: unbalanced braces ${depth}`)}}console.log(`WXML/LESS static checks passed: ${wxml} WXML, ${less} LESS`);'
node -e 'const fs=require("fs");const s=fs.readFileSync("FEATURE_STATUS.md","utf8");const rows=s.split("\n").filter(x=>/^\| .+ \| (✅|🚧|❌) \|/.test(x));const counts=rows.reduce((a,x)=>{const k=x.match(/\| (✅|🚧|❌) \|/)[1];a[k]=(a[k]||0)+1;return a},{});console.log(JSON.stringify({items:rows.length,counts},null,2));if(rows.length!==36||counts["✅"]!==32||counts["🚧"]!==2||counts["❌"]!==2)process.exit(2);'
node -e 'const a=require("./app.json");const main=a.pages.length;const sub=a.subpackages.map(x=>({root:x.root,count:x.pages.length}));const allSub=sub.reduce((n,x)=>n+x.count,0);const businessPublic=sub.filter(x=>x.root.startsWith("package")).reduce((n,x)=>n+x.count,0);const result={main,subpackageDeclarations:sub.length,allSub,businessPublic,personalSettings:allSub-businessPublic,total:main+allSub};console.log(JSON.stringify(result,null,2));if(JSON.stringify(result)!==JSON.stringify({main:5,subpackageDeclarations:6,allSub:20,businessPublic:18,personalSettings:2,total:25}))process.exit(2);'
```

## 环境待验项

以下两项没有本地完成，不能据此声称体验版验收通过：

1. 微信开发者工具服务端口未获授权。本次没有开启或修改“安全设置”，因此未执行开发者工具中的“工具 → 构建 npm”，尚未确认 `npm/miniprogram_npm` 对 `rxjs` 的实际解析，也未检查微信构建后的主包/分包体积。
2. 尚未在微信开发者工具模拟器或真机完成 320px、375px、430px 三档视觉检查；当前只有 WXML/LESS 静态契约和自动化回归证据。

后续应由有权限的人员按《发布前自测清单》完成上述两项，并记录开发者工具版本、设备/模拟器尺寸和结果。

## 数据库证据边界

- 本次只执行了 Prisma schema 校验、Prisma Client 生成和迁移 SQL 静态测试。
- 未执行 `prisma migrate dev`、`prisma migrate deploy` 或任何直接数据库写入。
- 三份迁移文件均尚不代表任何数据库已经应用；执行前必须确认专用开发/测试数据库、备份和回滚方案。

## 验收结论

第二阶段代码与文档通过当前本地自动化测试、构建、静态检查和零新增 lint 门槛。由于微信开发者工具 npm 构建/包体检查及 320/375/430 三档视觉检查尚未完成，第二阶段体验版环境验收仍为待完成；本记录不等于已发布，也不包含第三、第四阶段功能。
