# TDesign 通用页面模板

基于 TDesign 打造的通用页面模板，包含通用的登陆注册、个人中心、设置中心、信息流等等功能。

## 模版功能预览

### 首页

<div style="display: flex">
  <img width="375" alt="image" src="https://tdesign.gtimg.com/miniprogram/template/home-1.png">
  <img width="375" alt="image" src="https://tdesign.gtimg.com/miniprogram/template/home-2.png">
</div>

### 信息发布

<img width="375" alt="image" src="https://tdesign.gtimg.com/miniprogram/template/publish-1.png">

### 搜索页

<img width="375" alt="image" src="https://tdesign.gtimg.com/miniprogram/template/search-1.png">

### 个人中心
<div style="display: flex">
  <img width="375" alt="image" src="https://tdesign.gtimg.com/miniprogram/template/user-1.png">
  <img width="375" alt="image" src="https://tdesign.gtimg.com/miniprogram/template/user-2.png">
  <img width="375" alt="image" src="https://tdesign.gtimg.com/miniprogram/template/user-3.png">
</div>


### 设置中心

<img width="375" alt="image" src="https://tdesign.gtimg.com/miniprogram/template/setting-1.png">

### 消息中心

<img width="375" alt="image" src="https://tdesign.gtimg.com/miniprogram/template/message-1.png">


## 开发预览
### 目录结构（TODO: 生成目录结构树）


### 在开发者工具中预览

```bash
# 安装项目依赖
npm install

# 第一次拉取或切换机器时，创建本地环境选择文件
cp config.env.example.js config.env.js

```

打开[微信开发者工具](https://mp.weixin.qq.com/debug/wxadoc/dev/devtools/download.html)，导入整个项目，构建 npm 包，就可以预览示例了。

### 环境配置

小程序环境配置拆成两层：

- `config.js`：稳定入口，根据本地环境选择文件加载配置。
- `config.local.js`：本地开发配置。
- `config.test.js`：体验版/测试环境配置。
- `config.production.js`：审核版/正式版生产配置。
- `config.env.example.js`：环境选择示例。
- `config.env.js`：本地真实环境选择文件，已加入 `.gitignore`，不要提交。

`config.env.js` 可选值：

```js
export default 'local';
export default 'test';
export default 'production';
```

发布前确认：

- 本地开发：`config.env.js` 使用 `local`，自动开启 vConsole。
- 体验版：`config.env.js` 使用 `test`，自动关闭 vConsole。
- 审核版/正式版：`config.env.js` 使用 `production`，自动关闭 vConsole。

vConsole 只由 `config.env.js` 选择的环境决定，不在各环境详情配置中重复维护开关。由于
`config.env.js` 不进 Git，`dev`、`test`、`master` 之间的合并不会覆盖本机或发布机器的真实环境选择。

### 基础库版本

最低基础库版本`^2.6.5`


## 贡献成员

<a href="https://github.com/TDesignOteam/tdesign-miniprogram-starter/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=TDesignOteam/tdesign-miniprogram-starter" />
</a>

## 反馈

有任何问题，建议通过 [Github issues](https://github.com/TDesignOteam/tdesign-miniprogram-starter/issues) 反馈。

## 开源协议

TDesign 遵循 [MIT 协议](https://github.com/TDesignOteam/tdesign-miniprogram-starter/blob/main/LICENSE)。
