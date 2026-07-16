import appEnv from './config.env';
import localConfig from './config.local';
import testConfig from './config.test';
import productionConfig from './config.production';

const configs = {
  local: localConfig,
  test: testConfig,
  production: productionConfig,
};

const selected = configs[appEnv] || localConfig;

export default selected;
