# 2026-07-26 开发基线

本文记录 2026-07-26 在三个仓库 `dev` 分支上采集的开发基线，供后续变更采用“零新增 lint”规则进行比较。

## Git 状态

上游差异按“本地领先 / 本地落后”记录。

| 仓库 | 当前分支 | HEAD SHA | 上游 | 上游差异 | `git status --short --branch` |
| --- | --- | --- | --- | --- | --- |
| `intelligent-community` | `dev` | `8ee1e2e505ea1c312c6f409a805c200bbae03f08` | `origin/dev` | `2 / 0` | `## dev...origin/dev [ahead 2]`；`?? docs/superpowers/` |
| `intelligent-community-admin` | `dev` | `36d846a1e62c66e7bd050f5ae2b32fea235f5084` | `origin/dev` | `1 / 0` | `## dev...origin/dev [ahead 1]` |
| `intelligent-community-admin-web` | `dev` | `3dc33d91b03b724512ea21b7855d68e7265fdff8` | `origin/dev` | `0 / 0` | `## dev...origin/dev` |

以上状态由当前工作区重新读取。小程序仓库的 `docs/superpowers/` 是采集时已经存在的未跟踪目录，本基线保留该状态。

## 验证结果

| 项目 | 命令 | 结果 | 说明 |
| --- | --- | --- | --- |
| 小程序生产回归 | `node test/production-regressions.js` | PASS | 输出 `production regression guards passed` |
| 小程序 lint | `npm run lint` | FAIL（基线） | `4544 errors`、`0 warnings`；其中 `1814 errors and 0 warnings potentially fixable with the --fix option` |
| API 构建 | `npm run build` | PASS | `tsc -p tsconfig.build.json` 成功 |
| 后台前端构建 | `npm run build` | PASS | `vue-tsc --noEmit && vite build` 成功；Vite 提示部分压缩后 chunk 大于 500 kB，该包体提示不阻塞构建 |

### 结构化 ESLint 基线

- 生成命令：`npx eslint ./ --no-eslintrc -c ./.eslintrc.js --format json --output-file docs/superpowers/baselines/2026-07-26-eslint-baseline.json`
- 对应小程序 HEAD：`8ee1e2e505ea1c312c6f409a805c200bbae03f08`
- 文件路径：`docs/superpowers/baselines/2026-07-26-eslint-baseline.json`
- SHA-256：`a60acbeb11025a80574a55e235e362bb1481ebb8ffd1a81eac4d5a132cf644f3`
- Node 解析复核：共 `66` 个 ESLint 结果文件，其中 `11` 个文件存在问题；合计 `4544 errors`、`0 warnings`

后续对修改文件进行零新增 lint 比较时，以该 JSON 为基线，按 `(filePath, ruleId, line, column, message)` 五元组比较。仅当修改文件没有出现基线中不存在的新五元组时，才满足“修改文件零新增”；解析错误等 `ruleId` 为空的记录仍按其实际空值参与比较。

## 证据边界

- 这是 2026-07-26 的当前开发基线，不代表更早日期的仓库状态。
- 后端与后台前端在从 `master` 切换至 `dev` 前被观察为工作区干净，但这一切换前状态无法仅凭当前 Git 状态独立追溯。
- 小程序全仓 lint 错误是在本基线验证中观察到的存量结果；这些错误各自最初由何时、何次历史变更引入，无法仅凭当前 Git 状态独立追溯。
- 因此，后续质量判断以本文件记录的数值和命令为比较基准，不将“当前可复现”表述为对历史起源的证明。

## 用户批准的零新增 lint 规则

后续开发必须同时满足：

1. 新增文件 lint 通过。
2. 修改文件产生的 lint 错误为零新增。
3. 小程序全仓 lint 错误总数不得超过 `4544`。
4. 不扩大 lint ignore 范围，不新增或扩大规则 disable 来掩盖错误。
5. 持续执行小程序生产回归、API build 和后台前端 build，并保持通过。

若全仓 lint 仍因历史错误返回失败，只要满足上述规则，应如实报告基线失败与零新增验证结果，不得将全仓 lint 描述为通过。
