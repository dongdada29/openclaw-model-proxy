/**
 * 供应商注册表 - 支持的 API 供应商定义
 */
export const PROVIDERS = {
  // z.ai 全球版
  'zai': {
    name: 'z.ai Global',
    host: 'api.z.ai',
    keyPrefix: ['zai_', 'z-ai_'],
    pathPatterns: ['/api/paas', '/api/coding/paas'],
    apiFormat: 'openai',
  },
  
  // 智谱国内版
  'zhipu': {
    name: '智谱 AI',
    host: 'open.bigmodel.cn',
    keyPrefix: ['zhipu_', 'bigmodel_'],
    pathPatterns: [],
    apiFormat: 'openai',
  },
  
  // Anthropic
  'anthropic': {
    name: 'Anthropic',
    host: 'api.anthropic.com',
    keyPrefix: ['sk-ant-'],
    pathPatterns: ['/v1/messages'],
    apiFormat: 'anthropic',
  },
  
  // OpenAI
  'openai': {
    name: 'OpenAI',
    host: 'api.openai.com',
    // 注意：sk- 太宽泛，放在最后匹配
    keyPrefix: ['sk-proj-', 'sk-svca-', 'sk-'],
    pathPatterns: ['/v1/chat/completions', '/v1/completions'],
    apiFormat: 'openai',
  },
  
  // MiniMax
  'minimax': {
    name: 'MiniMax',
    host: 'api.minimaxi.com',
    keyPrefix: ['minimax_'],
    pathPatterns: [],
    apiFormat: 'openai',
  },
};

/**
 * 获取供应商列表
 */
export function getProviderList() {
  return Object.entries(PROVIDERS).map(([id, config]) => ({
    id,
    name: config.name,
    host: config.host,
    keyPrefix: config.keyPrefix,
    apiFormat: config.apiFormat,
  }));
}

/**
 * 获取供应商配置
 */
export function getProvider(providerId) {
  return PROVIDERS[providerId] || null;
}
