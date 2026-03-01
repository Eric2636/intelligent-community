import Mock from './WxMock';
// 导入包含path和data的对象
import loginMock from './login/index';
import my from './my/index';

export default () => {
  const mockData = [...loginMock, ...my];
  mockData.forEach((item) => {
    Mock.mock(item.path, { code: 200, success: true, data: item.data });
  });
};
