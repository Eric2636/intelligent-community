import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('publish page contains administrator-only functional post controls', () => {
  const view = read('packageForum/publish/index.wxml');
  const script = read('packageForum/publish/index.js');
  assert.match(view, /canManageForumPosts/);
  assert.match(view, /帖子类型/);
  assert.match(view, /报名人数上限/);
  assert.match(script, /userAPI\.getUserInfo\(\)/);
  assert.match(script, /await ensureLoggedIn\(this\)/);
  assert.match(script, /eventBus\.on\('userInfoChange'/);
  assert.match(script, /new Date\(`\$\{registrationDeadlineAt\}T23:59:59`\)\.toISOString\(\)/);
});

test('publish page uses a compact segmented control for functional post type', () => {
  const view = read('packageForum/publish/index.wxml');
  const script = read('packageForum/publish/index.js');
  assert.match(view, /帖子类型/);
  assert.equal((view.match(/publish-segmented/g) || []).length, 1);
  assert.match(view, /publish-segment--active/);
  assert.match(view, /bindtap="onFeatureTypeSelect"/);
  assert.match(script, /onFeatureTypeSelect\(e\)/);
  assert.match(view, /featureType === 'REGISTRATION'/);
  assert.match(view, /发布设置/);
});

test('mobile publishing does not offer or submit community announcements', () => {
  const view = read('packageForum/publish/index.wxml');
  const script = read('packageForum/publish/index.js');
  assert.doesNotMatch(view, /data-value="ANNOUNCEMENT"/);
  assert.doesNotMatch(view, /展示位置/);
  assert.match(script, /postType:\s*'NORMAL'/);
  assert.doesNotMatch(script, /const \{[^}]*postType[^}]*\} = this\.data/);
});

test('my posts follows the existing TDesign owner action sheet interaction', () => {
  const view = read('packageForum/my-posts/index.wxml');
  const script = read('packageForum/my-posts/index.js');
  assert.match(view, /aria-label="更多操作"/);
  assert.match(view, /<t-action-sheet/);
  assert.match(view, /description="管理这篇帖子"/);
  assert.match(view, /show-cancel/);
  assert.match(view, /bind:visible-change="onOwnerActionVisibleChange"/);
  assert.match(script, /e\.detail\.selected\.value/);
  assert.match(script, /ownerActionLoading/);
  assert.match(script, /label:\s*'删除'/);
  assert.match(script, /取消置顶/);
  assert.match(script, /报名名单/);
});

test('my posts puts pin and registration status in the footer instead of the title row', () => {
  const view = read('packageForum/my-posts/index.wxml');
  const titleRow = view.slice(view.indexOf('post-card__title-row'), view.indexOf('post-content'));
  const footer = view.slice(view.indexOf('post-meta'), view.indexOf('</view>\n      </view>\n    </view>', view.indexOf('post-meta')));
  assert.doesNotMatch(titleRow, /post-label/);
  assert.match(footer, /置顶/);
  assert.match(footer, /活动报名/);
});

test('forum list puts semantic post states in every card action footer', () => {
  const view = read('pages/forum/index.wxml');
  const titleRows = view.match(/<view class="post-item__title-row">[\s\S]*?<\/view>/g) || [];
  assert.equal(titleRows.length, 3);
  titleRows.forEach((row) => assert.doesNotMatch(row, /post-label/));
  assert.equal((view.match(/post-item__states/g) || []).length, 3);
  assert.match(read('pages/forum/index.less'), /&__states/);
});

test('forum post titles use ordered semantic labels with distinct styles', () => {
  const titleViews = [
    read('packageForum/my-posts/index.wxml'),
    read('packageForum/favorites/index.wxml'),
    read('packageForum/post/index.wxml'),
    read('pages/forum/index.wxml'),
  ];
  const styles = [
    read('packageForum/my-posts/index.less'),
    read('packageForum/favorites/index.less'),
    read('packageForum/post/index.less'),
    read('pages/forum/index.less'),
  ].join('\n');

  for (const view of titleViews) {
    const pinnedAt = view.indexOf('pinned');
    const announcementAt = view.indexOf("postType === 'ANNOUNCEMENT'");
    const registrationAt = view.indexOf("featureType === 'REGISTRATION'");
    assert.ok(pinnedAt >= 0, 'shows the pinned label condition');
    assert.ok(announcementAt > pinnedAt, 'shows announcement after pinned');
    assert.ok(registrationAt > announcementAt, 'shows registration after announcement');
  }
  assert.match(styles, /post-label--pinned/);
  assert.match(styles, /post-label--announcement/);
  assert.match(styles, /post-label--registration/);
});

test('registration detail shows its deadline and registered state before unavailable states', () => {
  const view = read('packageForum/post/index.wxml');
  const registeredAt = view.indexOf("post.registration.isRegistered");
  const fullAt = view.indexOf("post.registration.status === 'FULL'");
  assert.match(view, /报名截至 \{\{post\.registration\.deadlineAt\}\}/);
  assert.ok(registeredAt >= 0 && fullAt > registeredAt);
  assert.match(view, /post-registration__cancel/);
  assert.match(read('packageForum/post/index.less'), /\.post-registration\s*\{/);
});

test('registration detail uses a compact information block with a full-width action', () => {
  const view = read('packageForum/post/index.wxml');
  const less = read('packageForum/post/index.less');
  assert.match(view, /post-registration__main/);
  assert.match(view, /post-registration__action/);
  assert.match(view, /post-registration__button/);
  assert.match(view, /post-registration__capacity/);
  assert.match(less, /&__button\s*\{[\s\S]*width:\s*100%/);
  assert.doesNotMatch(less, /background:\s*fade\(@color-primary,\s*6%\)/);
});

test('publish page refreshes administrator permission from the server', async () => {
  const source = read('packageForum/publish/index.js').replace(/^import .*;\s*$/gm, '');
  let definition;
  const app = {
    globalData: { userInfo: { canManageForumPosts: false } },
    eventBus: { on() {}, off() {} },
  };
  vm.runInNewContext(source, {
    Page(config) { definition = config; },
    getApp: () => app,
    userAPI: {
      async getUserInfo() {
        return { code: 200, data: { id: 'admin-user', canManageForumPosts: true } };
      },
    },
    ensureLoggedIn: async () => true,
    wx: { getStorageSync: () => 'token' },
    console,
    setTimeout,
  });
  const page = {
    data: { ...definition.data },
    setData(updates) { Object.assign(this.data, updates); },
  };
  Object.entries(definition).forEach(([name, value]) => {
    if (typeof value === 'function') page[name] = value.bind(page);
  });

  await page.onLoad();

  assert.equal(page.data.canManageForumPosts, true);
  assert.equal(app.globalData.userInfo.canManageForumPosts, true);
});

test('functional post styles use only shared color variables', () => {
  for (const path of ['packageForum/publish/index.less', 'packageForum/my-posts/index.less']) {
    assert.doesNotMatch(read(path), /@gray2/);
  }
});
