# 统一用户标签 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the current user identity and current enabled admin binding to return one live user tag everywhere, without content-level tag snapshots or release-entry fallbacks.

**Architecture:** The backend owns one effective-tag resolver. It loads `User.identityType` and enabled `AdminUser` bindings for a set of user IDs, applies the existing administrator-label convention, and returns `userTagLabel` / `userTagType`. Task, forum, mall, feedback and user-list serializers consume that resolver. Mini-program templates render only those two fields. Existing database snapshot columns remain untouched but are no longer read or written.

**Tech Stack:** Node.js, TypeScript, Prisma/MySQL, Koa, Vue 3, WeChat Mini Program WXML, Node test runner.

---

### Task 1: Specify and implement the shared effective-tag resolver

**Files:**
- Modify: `intelligent-community-admin/src/modules/user/user-identity.ts`
- Create: `intelligent-community-admin/test/user-effective-tag.spec.ts`

- [ ] **Step 1: Write failing resolver tests**

```ts
test('enabled bound administrator overrides the default user identity', () => {
  assert.deepEqual(effectiveUserTag('OWNER', { role: 'ADMIN', orgName: '居委会', enabled: true }), {
    label: '居委会', type: 'admin',
  });
});

test('disabled or absent administrator falls back to the stored user identity', () => {
  assert.deepEqual(effectiveUserTag('OUTSIDER', { role: 'ADMIN', orgName: '居委会', enabled: false }), {
    label: '小区外人员', type: 'outsider',
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails because `effectiveUserTag` does not exist**

Run: `npx tsx --test test/user-effective-tag.spec.ts`

Expected: FAIL with an import or missing-export error for `effectiveUserTag`.

- [ ] **Step 3: Implement the minimal resolver**

```ts
export type UserTagType = 'owner' | 'outsider' | 'admin' | '';
export type EffectiveUserTag = { label: string; type: UserTagType };

export function effectiveUserTag(
  identityType: unknown,
  admin?: { role?: 'ADMIN' | 'SUPERADMIN'; orgName?: string | null; enabled?: boolean } | null,
): EffectiveUserTag {
  if (admin?.enabled && admin.role) {
    return { label: admin.role === 'SUPERADMIN' ? '平台管理员' : admin.orgName?.trim() || '网站管理员', type: 'admin' };
  }
  const type = normalizeIdentityType(identityType);
  if (type === 'OWNER') return { label: '业主', type: 'owner' };
  if (type === 'OUTSIDER') return { label: '小区外人员', type: 'outsider' };
  return { label: '', type: '' };
}
```

- [ ] **Step 4: Run the resolver test and verify it passes**

Run: `npx tsx --test test/user-effective-tag.spec.ts`

Expected: PASS.

### Task 2: Return live tags from all backend read models

**Files:**
- Modify: `intelligent-community-admin/src/modules/user/user-identity.ts`
- Modify: `intelligent-community-admin/src/modules/user/user.service.ts`
- Modify: `intelligent-community-admin/src/modules/admin/admin.service.ts`
- Modify: `intelligent-community-admin/src/modules/task/task.service.ts`
- Modify: `intelligent-community-admin/src/modules/forum/forum.service.ts`
- Modify: `intelligent-community-admin/src/modules/mall/mall-item.service.ts`
- Modify: `intelligent-community-admin/src/modules/mall/mall.serialize.ts`
- Modify: `intelligent-community-admin/src/modules/feedback/feedback.service.ts`
- Test: `intelligent-community-admin/test/user-effective-tag.spec.ts`
- Test: `intelligent-community-admin/test/feedback.spec.ts`
- Test: `intelligent-community-admin/test/mall-public-read.spec.ts`

- [ ] **Step 1: Extend the failing tests for live tags, not snapshots**

```ts
test('content serialisation uses current user tag and ignores persisted adminLabel snapshots', async () => {
  const tag = effectiveUserTag('OWNER', null);
  assert.deepEqual(tag, { label: '业主', type: 'owner' });
  // Fixture content containing adminLabel: '居委会' must still return userTagLabel: '业主'.
});

test('feedback returns the same tag fields as user management', async () => {
  assert.equal(result.list[0].userTagLabel, '业主');
  assert.equal(result.list[0].userTagType, 'owner');
});
```

- [ ] **Step 2: Run targeted tests and verify the snapshot assertion fails**

Run: `npx tsx --test test/user-effective-tag.spec.ts test/feedback.spec.ts test/mall-public-read.spec.ts`

Expected: FAIL because content and feedback responses still expose snapshot-derived or identity-only fields.

- [ ] **Step 3: Add one batch resolver and use it in every read path**

```ts
export async function resolveEffectiveUserTags(userIds: readonly string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const [users, admins] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, identityType: true } }),
    prisma.adminUser.findMany({ where: { boundUserId: { in: ids }, enabled: true }, select: { boundUserId: true, role: true, orgName: true, enabled: true } }),
  ]);
  const adminByUserId = new Map(admins.filter((row) => row.boundUserId).map((row) => [row.boundUserId!, row]));
  return new Map(users.map((user) => [user.id, effectiveUserTag(user.identityType, adminByUserId.get(user.id))]));
}
```

For each list/detail query, collect author or publisher IDs once, resolve them in one batch, and return only:

```ts
userTagLabel: tag.label,
userTagType: tag.type,
```

Do not use `publisherIdentity`, `authorIdentity`, `adminLabel`, `contentTagLabel`, `publisherIdentityLabel`, or `authorIdentityLabel` to calculate response tags. Retain `createdByAdminId` for audit only. Do not alter the current publish-permission checks.

- [ ] **Step 4: Run targeted tests and verify they pass**

Run: `npx tsx --test test/user-effective-tag.spec.ts test/feedback.spec.ts test/mall-public-read.spec.ts test/user-profile-sync-behavior.spec.ts`

Expected: PASS.

### Task 3: Stop writing content tag snapshots for newly created content

**Files:**
- Modify: `intelligent-community-admin/src/modules/task/task.service.ts`
- Modify: `intelligent-community-admin/src/modules/forum/forum.service.ts`
- Modify: `intelligent-community-admin/src/modules/admin/admin.service.ts`
- Test: `intelligent-community-admin/test/user-effective-tag.spec.ts`

- [ ] **Step 1: Write failing assertions for creation payloads**

```ts
test('new mini-program and admin content do not write display-tag snapshots', () => {
  assert.doesNotMatch(taskServiceSource, /publisherIdentity:\s*publisher\?\.identityType/);
  assert.doesNotMatch(taskServiceSource, /adminLabel:/);
  assert.doesNotMatch(forumServiceSource, /authorIdentity:\s*author\?\.identityType/);
});
```

- [ ] **Step 2: Run the assertion and verify it fails on existing snapshot writes**

Run: `npx tsx --test test/user-effective-tag.spec.ts`

Expected: FAIL because creation methods still write identity and administrator label snapshots.

- [ ] **Step 3: Remove snapshot assignments from new-content and draft publication paths**

Delete only display-tag snapshot assignments from content create/update payloads. Continue writing `publisherId`/`authorId`, name/avatar snapshots, and `createdByAdminId` audit attribution. Do not create a Prisma migration in this task.

- [ ] **Step 4: Run the targeted suite and verify it passes**

Run: `npx tsx --test test/user-effective-tag.spec.ts test/user-profile-snapshots.spec.ts test/admin-label.spec.ts`

Expected: PASS after updating tests whose former expectation was snapshot storage.

### Task 4: Replace all mini-program tag fallbacks with unified fields

**Files:**
- Modify: `intelligent-community/pages/task/index.wxml`
- Modify: `intelligent-community/packageTask/detail/index.wxml`
- Modify: `intelligent-community/packageTask/my-tasks/index.wxml`
- Modify: `intelligent-community/pages/forum/index.wxml`
- Modify: `intelligent-community/packageForum/post/index.wxml`
- Modify: `intelligent-community/pages/mall/index.wxml`
- Modify: `intelligent-community/packageMall/detail/index.wxml`
- Create: `intelligent-community/test/unified-user-tag-rendering.test.js`

- [ ] **Step 1: Write a failing template contract test**

```js
for (const file of tagTemplates) {
  const source = readFileSync(file, 'utf8');
  assert.match(source, /userTagLabel/);
  assert.doesNotMatch(source, /contentTagLabel|publisherIdentityLabel|authorIdentityLabel/);
}
```

- [ ] **Step 2: Run the test and verify it fails on legacy fallback fields**

Run: `node --test test/unified-user-tag-rendering.test.js`

Expected: FAIL because templates combine legacy tag fields.

- [ ] **Step 3: Render only the unified API fields**

Replace every existing tag expression with:

```xml
<text wx:if="{{item.userTagLabel}}" class="identity-tag identity-tag--{{item.userTagType}}">{{item.userTagLabel}}</text>
```

Use the matching loop variable (`card`, `task`, `post`, or `item`) at each location. Convert current market `admin-tag` positions to this same unified tag expression and style class.

- [ ] **Step 4: Run mini-program template tests and lint**

Run: `node --test test/unified-user-tag-rendering.test.js && npm run lint`

Expected: PASS.

### Task 5: Update the admin web type and user-management renderer

**Files:**
- Modify: `intelligent-community-admin-web/src/types/api.ts`
- Modify: `intelligent-community-admin-web/src/views/UsersView.vue`
- Modify: `intelligent-community-admin-web/src/views/FeedbacksView.vue`
- Test: `intelligent-community-admin-web/test/unified-user-tag.spec.mjs`

- [ ] **Step 1: Write a failing static contract test**

```js
assert.match(usersView, /record\.userTagLabel/);
assert.match(feedbackView, /feedback\.userTagLabel/);
assert.doesNotMatch(usersView, /record\.contentTagLabel/);
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/unified-user-tag.spec.mjs`

Expected: FAIL because the admin web reads `contentTagLabel` and `identityLabel`.

- [ ] **Step 3: Replace response types and renderers**

```ts
userTagLabel?: string;
userTagType?: 'owner' | 'outsider' | 'admin' | '';
```

Render `userTagLabel` and colour from `userTagType` in user management and feedback. Keep the existing “用户标签” column title and visual style.

- [ ] **Step 4: Run the admin-web contract test and production build**

Run: `node --test test/unified-user-tag.spec.mjs && npm run build`

Expected: PASS.

### Task 6: Verify end-to-end contracts and update feature documentation

**Files:**
- Modify: `intelligent-community/FUNCTION_GUIDE.md`
- Modify: `intelligent-community/FEATURE_STATUS.md`
- Modify: `intelligent-community/PROJECT_SUMMARY.md`

- [ ] **Step 1: Update documentation**

Document the effective-tag precedence, live update behavior, absence of content snapshots, and unchanged administrator publishing permissions.

- [ ] **Step 2: Run all relevant suites**

Run:

```bash
cd intelligent-community-admin && npm test
cd ../intelligent-community && node --test test/*.test.js
cd ../intelligent-community-admin-web && node --test test/*.spec.mjs && npm run build
```

Expected: all commands PASS.

- [ ] **Step 3: Manually verify the local development database**

Verify that changing one user’s `identityType`, binding or unbinding the user from an enabled administrator, and changing the administrator `orgName` each changes the same user’s label consistently in task, forum, mall, feedback, and user-management API responses. Do not delete any database columns.
