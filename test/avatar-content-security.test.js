const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = (filePath) => readFile(path.join(root, filePath), 'utf8');

function methodSource(pageSource, methodName) {
  const start = pageSource.search(new RegExp(`\\n\\s*(?:async\\s+)?${methodName}\\s*\\(`));
  assert.notEqual(start, -1, `缺少页面方法：${methodName}`);
  const bodyStart = pageSource.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < pageSource.length; index += 1) {
    if (pageSource[index] === '{') depth += 1;
    if (pageSource[index] === '}') {
      depth -= 1;
      if (depth === 0) return pageSource.slice(start, index + 1);
    }
  }
  assert.fail(`页面方法未闭合：${methodName}`);
}

test('avatar upload preserves review metadata without changing the shared URL uploader contract', async () => {
  const cloudMedia = await source('utils/cloudMedia.js');
  assert.match(cloudMedia, /export async function uploadAvatarForReview/);
  assert.match(cloudMedia, /avatarReview/);
  assert.match(cloudMedia, /uploadLocalFilesToCloud[\s\S]*return urls;/);
});

test('profile save cannot bypass avatar review and both avatar entry points use the reviewed flow', async () => {
  const page = await source('pages/my/info-edit/index.js');
  const payload = page.slice(page.indexOf('function buildUserInfoPayload'), page.indexOf('\n}\n\nPage({'));
  assert.doesNotMatch(payload, /avatar\s*:/);
  assert.match(methodSource(page, 'uploadAvatar'), /uploadAvatarForReview/);
  assert.match(methodSource(page, 'uploadAvatar'), /_avatarUploadInFlight/);
  assert.doesNotMatch(methodSource(page, 'uploadAvatar'), /personInfo\.avatar/);
  assert.match(methodSource(page, 'onChooseWechatAvatar'), /this\.uploadAvatar\(avatarUrl\)/);
  assert.match(methodSource(page, 'onChooseCustomAvatar'), /this\.uploadAvatar\(file\.tempFilePath\)/);
});

test('pending avatar review is resumed, polled, refreshed on pass, and stopped on unload', async () => {
  const [page, template, cloudApi] = await Promise.all([
    source('pages/my/info-edit/index.js'),
    source('pages/my/info-edit/index.wxml'),
    source('api/cloud.js'),
  ]);
  assert.match(cloudApi, /getAvatarReview\(reviewId\)[\s\S]*api\/user\/avatar-reviews/);
  assert.match(methodSource(page, 'onLoad'), /resumeAvatarReview/);
  assert.match(methodSource(page, 'onLoad'), /await this\.getPersonalInfo\(\)[\s\S]*resumeAvatarReview/);
  assert.match(methodSource(page, 'getPersonalInfo'), /_profileRequestId/);
  assert.match(methodSource(page, 'checkAvatarReview'), /PASSED[\s\S]*getPersonalInfo/);
  assert.match(methodSource(page, 'checkAvatarReview'), /await userAPI\.getAvatarReview\(reviewId\);[\s\S]*if \(!this\._avatarReviewPageAlive\) return;/);
  assert.match(methodSource(page, 'checkAvatarReview'), /REJECTED|FAILED/);
  assert.match(methodSource(page, 'onUnload'), /clearTimeout/);
  assert.match(template, /头像审核中，通过后自动生效/);
});

test('review failures display generic user-safe messages only', async () => {
  const page = await source('pages/my/info-edit/index.js');
  const polling = methodSource(page, 'checkAvatarReview');
  assert.match(polling, /头像未通过审核|头像审核失败/);
  assert.doesNotMatch(polling, /\blabel\b|涉政|色情|违法|['"]risky['"]|['"]review['"]/);
});
