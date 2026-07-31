# Avatar Content Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a successful WeChat 2.0 media content review before a newly uploaded user avatar becomes visible.

**Architecture:** The API uploads avatar bytes to COS, creates a persisted review, and submits the public URL to WeChat `mediaCheckAsync`. A signed WeChat callback resolves the review; only the newest pending review may update `User.avatar` through the existing profile snapshot synchronizer. The mini program shows pending/rejected state and never submits avatar URLs through the general profile update endpoint.

**Tech Stack:** WeChat Mini Program JavaScript/WXML, Koa, TypeScript, Axios, Prisma/MySQL, Node test runner, Tencent COS.

---

### Task 1: Persist avatar review state

**Files:**
- Modify: `../intelligent-community-admin/prisma/schema.prisma`
- Create: `../intelligent-community-admin/prisma/migrations/20260731191000_add_avatar_reviews/migration.sql`
- Create: `../intelligent-community-admin/test/avatar-review-schema.spec.ts`

- [ ] **Step 1: Write the failing schema test**

Assert that Prisma declares `AvatarReview`, maps it to `avatar_reviews`, has a unique `traceId`, and indexes `(userId, createdAt)` plus `(userId, status, createdAt)`. Assert the migration creates the same columns and indexes.

- [ ] **Step 2: Run the schema test and verify RED**

Run: `npx tsx --test test/avatar-review-schema.spec.ts`
Expected: FAIL because `AvatarReview` and its migration do not exist.

- [ ] **Step 3: Add the minimal model and migration**

Use string statuses to avoid a production enum migration:

```prisma
model AvatarReview {
  id            String    @id @default(cuid())
  userId        String
  mediaUrl      String    @db.Text
  traceId       String?   @unique
  status        String    @db.VarChar(24)
  suggest       String?   @db.VarChar(24)
  label         Int?
  wechatErrcode Int?
  completedAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @default(now()) @updatedAt

  @@index([userId, createdAt])
  @@index([userId, status, createdAt])
  @@map("avatar_reviews")
}
```

- [ ] **Step 4: Run the schema test and Prisma validation**

Run: `npx tsx --test test/avatar-review-schema.spec.ts && npx prisma validate`
Expected: PASS.

### Task 2: Add a reusable WeChat content-security client

**Files:**
- Create: `../intelligent-community-admin/src/modules/wechat/wechat-access-token.ts`
- Create: `../intelligent-community-admin/src/modules/wechat/wechat-content-security.ts`
- Modify: `../intelligent-community-admin/src/modules/auth/auth.service.ts`
- Create: `../intelligent-community-admin/test/wechat-content-security.spec.ts`

- [ ] **Step 1: Write failing client tests**

Cover cached access tokens, a request payload containing `{ media_url, media_type: 2, version: 2, scene: 1, openid }`, missing `trace_id`, WeChat non-zero `errcode`, and transport errors.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx tsx --test test/wechat-content-security.spec.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the client and reuse token retrieval in auth**

Expose injected HTTP methods in tests. Production requests use:

```text
GET  https://api.weixin.qq.com/cgi-bin/token
POST https://api.weixin.qq.com/wxa/media_check_async?access_token=...
```

Throw a controlled `HttpError(503, '头像安全检测暂不可用，请稍后重试')` for missing configuration, rejected tasks, or transport failures. Never log AppSecret or access tokens.

- [ ] **Step 4: Run focused auth and client tests**

Run: `npx tsx --test test/wechat-content-security.spec.ts test/auth-phone-login.spec.ts test/user-profile-sync-behavior.spec.ts`
Expected: PASS.

### Task 3: Implement review submission, status, and signed callback

**Files:**
- Create: `../intelligent-community-admin/src/modules/avatar-review/avatar-review.service.ts`
- Create: `../intelligent-community-admin/src/modules/avatar-review/wechat-callback.ts`
- Modify: `../intelligent-community-admin/src/modules/upload/upload.service.ts`
- Modify: `../intelligent-community-admin/src/modules/user/user.service.ts`
- Modify: `../intelligent-community-admin/src/modules/auth/auth.dto.ts`
- Modify: `../intelligent-community-admin/src/modules/auth/auth.service.ts`
- Modify: `../intelligent-community-admin/src/routes/index.ts`
- Modify: `../intelligent-community-admin/.env.example`
- Create: `../intelligent-community-admin/test/avatar-review.spec.ts`
- Create: `../intelligent-community-admin/test/avatar-review.routes.spec.ts`

- [ ] **Step 1: Write failing service and route tests**

Cover submission, `pass`, `risky`, `review`, callback error, invalid SHA-1 signature, wrong AppID, unknown trace, duplicate callback, latest-wins, ownership checks, direct avatar PATCH rejection, and ignored login `avatarUrl`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npx tsx --test test/avatar-review.spec.ts test/avatar-review.routes.spec.ts`
Expected: FAIL because the service and routes do not exist.

- [ ] **Step 3: Implement minimal review behavior**

Use `sha1([WX_MESSAGE_TOKEN, timestamp, nonce].sort().join(''))` for callback verification. Return `echostr` only after a valid GET signature. On POST, validate signature and AppID before calling:

```ts
handleWechatResult({ traceId, appid, errcode, result: { suggest, label } })
```

Only a current `PENDING` review with no newer pending review may call `runUserProfileUpdate({ changes: { avatar: mediaUrl } })`. Treat `review` as rejected because no manual queue is in scope.

- [ ] **Step 4: Integrate avatar upload without changing other media uploads**

For `module !== 'avatar'`, preserve the existing `{ url, key, bucket, region }` response. For `module === 'avatar'`, create and submit a review and return:

```json
{"url":"https://...","avatarReview":{"id":"...","status":"PENDING"}}
```

- [ ] **Step 5: Run focused and full backend tests**

Run: `npx tsx --test test/avatar-review*.spec.ts test/user-profile-sync-behavior.spec.ts && npm test`
Expected: all tests PASS.

### Task 4: Implement mini-program pending avatar UX

**Files:**
- Modify: `utils/cloudMedia.js`
- Modify: `api/cloud.js`
- Modify: `pages/my/info-edit/index.js`
- Modify: `pages/my/info-edit/index.wxml`
- Create: `test/avatar-content-security.test.js`

- [ ] **Step 1: Write the failing mini-program test**

Assert both chooser handlers call `uploadAvatar`, avatar upload retains `avatarReview` metadata, profile payload omits `avatar`, polling stops on unload, `PASSED` refreshes profile, and `REJECTED`/`FAILED` use generic messages.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/avatar-content-security.test.js`
Expected: FAIL because review state handling does not exist and payload still contains `avatar`.

- [ ] **Step 3: Implement the minimal UI flow**

Add an avatar-specific uploader that returns `{ url, avatarReview }` without changing the array-of-URL contract used by forum/task/mall. Store the review id locally, poll only while the page is alive, and render `头像审核中，通过后自动生效` while pending.

- [ ] **Step 4: Run mini-program focused and regression tests**

Run: `node --test test/avatar-content-security.test.js test/auth-login-dialog.test.js test/default-avatar-ui.test.js test/my-profile-sync.test.js test/production-regressions.js`
Expected: PASS.

### Task 5: Verify, document configuration, and commit dev changes

**Files:**
- Modify: `../intelligent-community-admin/README.md`
- Modify: `docs/发布前自测清单.md`

- [ ] **Step 1: Document callback and environment setup**

Document `WX_MESSAGE_TOKEN`, production callback URL `/api/wechat/content-security/callback`, plaintext JSON mode, `pass/risky/review` behavior, and a real-device test using both avatar entry points.

- [ ] **Step 2: Run backend verification**

Run: `npm test && npm run lint && npm run build`
Expected: exit code 0 for all commands.

- [ ] **Step 3: Run mini-program verification**

Run all `node --test test/*.test.js` and `npx tsx --test test/*.spec.ts` suites, then the repository lint fingerprint check used by the current baseline.
Expected: all tests pass and no new lint fingerprints.

- [ ] **Step 4: Commit each repository on dev**

Backend commit: `fix(api): require review before avatar update`

Mini-program commit: `fix(mini): gate avatar updates on content review`

### Task 6: Promote and deploy

**Files:** No new source files; branch integration and deployment only.

- [ ] **Step 1: Merge verified dev commits into test branches**

Use explicit dev commits. Stop on business-code conflicts. Re-run backend tests/build and mini-program tests on `test`.

- [ ] **Step 2: Verify test database migration and callback**

Back up the confirmed test database, run `prisma migrate deploy`, configure the test callback/token, and verify signed GET plus one real avatar result.

- [ ] **Step 3: Merge verified dev commits into master branches**

Do not merge `test` into `master`; merge or cherry-pick the approved dev commits. Re-run production-branch builds and tests.

- [ ] **Step 4: Deploy the production backend**

Back up `ic_prod`, configure `WX_MESSAGE_TOKEN`, sync local master source, build the API image, run `prisma migrate deploy`, recreate the container, and verify `/api/health` plus the signed callback endpoint.

- [ ] **Step 5: Hand off mini-program master**

Leave the mini-program on the verified `master` commit. The user uploads and submits it through WeChat Developer Tools.
