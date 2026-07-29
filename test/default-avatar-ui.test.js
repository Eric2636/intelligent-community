const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = (filePath) => readFile(path.join(root, filePath), 'utf8');

test('all user avatar surfaces use the TDesign user icon when the image is empty', async () => {
  const surfaces = [
    ['小区留言列表', 'pages/forum/index.wxml', 'pages/forum/index.json'],
    ['帖子与回复详情', 'packageForum/post/index.wxml', 'packageForum/post/index.json'],
    ['市场评论', 'packageMall/detail/index.wxml', 'packageMall/detail/index.json'],
    ['个人信息编辑', 'pages/my/info-edit/index.wxml', 'pages/my/info-edit/index.json'],
  ];

  const loadedSurfaces = await Promise.all(
    surfaces.map(async ([name, templatePath, configPath]) => {
      const [template, configSource] = await Promise.all([source(templatePath), source(configPath)]);
      return [name, template, configSource];
    }),
  );

  loadedSurfaces.forEach(([name, template, configSource]) => {
    const config = JSON.parse(configSource);
    assert.equal(
      config.usingComponents['t-avatar'],
      'tdesign-miniprogram/avatar/avatar',
      `${name}必须注册 TDesign 头像组件`,
    );
    assert.match(template, /<t-avatar\b[^>]*icon="\{\{[^}]*\? '' : 'user'\}\}"/, `${name}必须使用统一 user 图标`);
    assert.doesNotMatch(template, /avatar--placeholder/, `${name}不能继续维护另一套默认头像占位样式`);
  });
});
