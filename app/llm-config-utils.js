(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DPRLLMConfigUtils = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_PLATO_BASE_URL = 'https://api.bltcy.ai/v1';
  const DEFAULT_PLATO_CHAT_MODELS = [
    'gemini-3-flash-preview-thinking-1000',
    'deepseek-v3.2',
    'gpt-5-chat',
    'gemini-3-pro-preview',
  ];

  // 扩展的第三方模型预设配置
  const OPENAI_COMPATIBLE_PRESETS = Object.freeze({
    openai: Object.freeze({
      key: 'openai',
      label: 'OpenAI 官方',
      baseUrl: 'https://api.openai.com/v1',
      models: Object.freeze([
        'gpt-4.1',
        'gpt-4.1-mini',
        'gpt-4.1-nano',
        'gpt-4o',
        'gpt-4o-mini',
        'o3-mini',
        'o1',
      ]),
      defaultModel: 'gpt-4.1-mini',
    }),
    deepseek: Object.freeze({
      key: 'deepseek',
      label: 'DeepSeek 官方',
      baseUrl: 'https://api.deepseek.com',
      models: Object.freeze(['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder']),
      defaultModel: 'deepseek-chat',
    }),
    kimi: Object.freeze({
      key: 'kimi',
      label: 'Kimi (Moonshot)',
      baseUrl: 'https://api.moonshot.cn/v1',
      models: Object.freeze([
        'kimi-k2.5',
        'kimi-k2-turbo-preview',
        'kimi-k2-thinking',
        'kimi-latest',
      ]),
      defaultModel: 'kimi-k2.5',
    }),
    glm: Object.freeze({
      key: 'glm',
      label: '智谱 GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      models: Object.freeze([
        'glm-4.5',
        'glm-4.5-air',
        'glm-4.5-flash',
        'glm-4-plus',
      ]),
      defaultModel: 'glm-4.5-flash',
    }),
    qwen: Object.freeze({
      key: 'qwen',
      label: '通义千问 (阿里)',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: Object.freeze([
        'qwen-turbo',
        'qwen-plus',
        'qwen-max',
        'qwen-coder-plus',
      ]),
      defaultModel: 'qwen-turbo',
    }),
    doubao: Object.freeze({
      key: 'doubao',
      label: '豆包 (字节)',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      models: Object.freeze([
        'doubao-1.5-pro-32k',
        'doubao-1.5-lite-32k',
        'doubao-pro-4k',
        'doubao-lite-4k',
      ]),
      defaultModel: 'doubao-1.5-lite-32k',
    }),
    minimax: Object.freeze({
      key: 'minimax',
      label: 'MiniMax',
      baseUrl: 'https://api.minimaxi.com/v1',
      models: Object.freeze([
        'MiniMax-Text-01',
        'abab6.5s',
        'abab6.5-chat',
      ]),
      defaultModel: 'abab6.5s',
    }),
    siliconflow: Object.freeze({
      key: 'siliconflow',
      label: 'SiliconFlow',
      baseUrl: 'https://api.siliconflow.cn/v1',
      models: Object.freeze([
        'deepseek-ai/DeepSeek-V3',
        'deepseek-ai/DeepSeek-R1',
        'Qwen/Qwen2.5-72B-Instruct',
        'meta-llama/Llama-3.3-70B-Instruct',
      ]),
      defaultModel: 'deepseek-ai/DeepSeek-V3',
    }),
    custom: Object.freeze({
      key: 'custom',
      label: '自定义 OpenAI 兼容接口',
      baseUrl: '',
      models: Object.freeze(['']),
      defaultModel: '',
    }),
  });

  const normalizeText = (value) => String(value || '').trim();

  const normalizeBaseUrlForStorage = (value) => {
    let text = normalizeText(value).replace(/\/+$/g, '');
    if (!text) return '';
    text = text.replace(/\/chat\/completions$/i, '');
    return text.replace(/\/+$/g, '');
  };

  const buildChatCompletionsEndpoint = (value) => {
    const raw = normalizeText(value).replace(/\/+$/g, '');
    if (!raw) return '';
    if (/\/chat\/completions$/i.test(raw)) return raw;
    const normalized = normalizeBaseUrlForStorage(raw);
    if (!normalized) return '';
    if (/\/v\d+$/i.test(normalized)) {
      return `${normalized}/chat/completions`;
    }
    return `${normalized}/v1/chat/completions`;
  };

  const sanitizeModelList = (values, maxCount = 3) => {
    const rawList = Array.isArray(values) ? values : [values];
    const out = [];
    const seen = new Set();
    for (const value of rawList) {
      const parts = String(value || '')
        .split(/[\n,]+/)
        .map((item) => normalizeText(item))
        .filter(Boolean);
      for (const name of parts) {
        const key = name.toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(name);
        if (out.length >= Math.max(Number(maxCount) || 0, 1)) {
          return out;
        }
      }
    }
    return out;
  };

  const resolveChatModels = (secret) => {
    const safeSecret = secret && typeof secret === 'object' ? secret : {};
    const chatList = Array.isArray(safeSecret.chatLLMs) ? safeSecret.chatLLMs : [];
    const models = [];
    const seen = new Set();
    chatList.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const baseUrl = normalizeBaseUrlForStorage(item.baseUrl || '');
      const apiKey = normalizeText(item.apiKey || '');
      const modelNames = sanitizeModelList(item.models || [], 99);
      if (!baseUrl || !apiKey || !modelNames.length) return;
      modelNames.forEach((name) => {
        const dedupeKey = `${name.toLowerCase()}\u0000${baseUrl}\u0000${apiKey}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        models.push({
          name,
          apiKey,
          baseUrl,
        });
      });
    });
    return models;
  };

  const resolveSummaryLLM = (secret) => {
    const safeSecret = secret && typeof secret === 'object' ? secret : {};
    const summarized = safeSecret.summarizedLLM || {};
    const baseUrl = normalizeBaseUrlForStorage(summarized.baseUrl || '');
    const apiKey = normalizeText(summarized.apiKey || '');
    const model = normalizeText(summarized.model || '');
    if (baseUrl && apiKey && model) {
      return { baseUrl, apiKey, model };
    }

    const chatModels = resolveChatModels(safeSecret);
    if (!chatModels.length) return null;
    return {
      baseUrl: normalizeBaseUrlForStorage(chatModels[0].baseUrl || ''),
      apiKey: normalizeText(chatModels[0].apiKey || ''),
      model: normalizeText(chatModels[0].name || ''),
    };
  };

  const inferProviderType = (secret) => {
    const safeSecret = secret && typeof secret === 'object' ? secret : {};
    const llmProvider = safeSecret.llmProvider || {};
    const explicit = normalizeText(llmProvider.type || llmProvider.provider || '').toLowerCase();
    if (explicit === 'plato' || explicit === 'openai-compatible') {
      return explicit;
    }
    const summary = resolveSummaryLLM(safeSecret);
    if (!summary) return 'plato';
    if (/bltcy\.ai|gptbest\.vip/i.test(summary.baseUrl)) {
      return 'plato';
    }
    return 'openai-compatible';
  };

  const getOpenAICompatiblePreset = (key) => {
    const presetKey = normalizeText(key).toLowerCase();
    const preset = OPENAI_COMPATIBLE_PRESETS[presetKey];
    if (!preset) return null;
    return {
      key: preset.key,
      label: preset.label,
      baseUrl: preset.baseUrl,
      models: [...preset.models],
    };
  };

  const inferChatApiProfile = (baseUrl, model) => {
    const normalizedBaseUrl = normalizeBaseUrlForStorage(baseUrl || '').toLowerCase();
    const normalizedModel = normalizeText(model || '').toLowerCase();
    if (
      /(^|\/\/)(api\.)?deepseek\.com(?:$|\/)/i.test(normalizedBaseUrl)
      || normalizedModel.startsWith('deepseek-')
    ) {
      return 'deepseek';
    }
    if (/bltcy\.ai|gptbest\.vip/i.test(normalizedBaseUrl)) {
      return 'plato';
    }
    return 'generic-openai';
  };

  const shouldUseXApiKeyHeader = ({ baseUrl, model }) => {
    const normalizedBaseUrl = normalizeBaseUrlForStorage(baseUrl || '').toLowerCase();
    const normalizedModel = normalizeText(model || '').toLowerCase();
    if (
      /^minimax-/i.test(normalizedModel)
      || /(^|\/\/)api\.minimax(?:i)?\.(?:io|com)(?:$|\/)/i.test(normalizedBaseUrl)
    ) {
      return false;
    }
    return true;
  };

  const buildStreamingChatPayload = ({ baseUrl, model, messages }) => {
    const payload = {
      model: normalizeText(model),
      messages: Array.isArray(messages) ? messages : [],
      stream: true,
    };
    const profile = inferChatApiProfile(baseUrl, model);
    if (profile === 'plato') {
      payload.reasoning = { effort: 'medium' };
      payload.extra_body = { return_reasoning: true };
    } else if (profile === 'deepseek' && normalizeText(model).toLowerCase() === 'deepseek-reasoner') {
      payload.thinking = { type: 'enabled' };
    }
    return payload;
  };

  const buildConnectivityTestPayload = ({ baseUrl, model }) => {
    const normalizedModel = normalizeText(model);
    const normalizedBaseUrl = normalizeBaseUrlForStorage(baseUrl || '').toLowerCase();
    const isKimiFamily =
      /^kimi-/i.test(normalizedModel)
      || /(^|\/\/)api\.moonshot\.cn(?:$|\/)/i.test(normalizedBaseUrl)
      || /moonshot/.test(normalizedBaseUrl);
    const wantsMaxCompletionTokens =
      /^glm-/i.test(normalizedModel)
      || /open\.bigmodel\.cn/.test(normalizedBaseUrl)
      || /thinking/i.test(normalizedModel)
      || /^kimi-/i.test(normalizedModel)
      || /^minimax-/i.test(normalizedModel)
      || normalizedModel.toLowerCase() === 'deepseek-reasoner';
    const payload = {
      model: normalizedModel,
      messages: [
        {
          role: 'system',
          content: 'Reply with exactly: hello world',
        },
        {
          role: 'user',
          content: 'hello world',
        },
      ],
      temperature: isKimiFamily ? 1 : 0,
      max_tokens: 256,
    };
    if (wantsMaxCompletionTokens) {
      payload.max_completion_tokens = 256;
    }
    const profile = inferChatApiProfile(baseUrl, model);
    if (profile === 'deepseek' && normalizedModel.toLowerCase() === 'deepseek-reasoner') {
      payload.thinking = { type: 'disabled' };
    }
    return payload;
  };

  // 获取所有预设的提供商列表（用于UI展示）
  const getAllProviderPresets = () => {
    return Object.values(OPENAI_COMPATIBLE_PRESETS).map((preset) => ({
      key: preset.key,
      label: preset.label,
      baseUrl: preset.baseUrl,
      models: [...preset.models],
      defaultModel: preset.defaultModel || preset.models[0] || '',
    }));
  };

  // 根据提供商key获取默认模型
  const getDefaultModelForProvider = (providerKey) => {
    const preset = OPENAI_COMPATIBLE_PRESETS[providerKey];
    return preset ? preset.defaultModel || preset.models[0] || '' : '';
  };

  // 检查是否是有效的第三方提供商
  const isValidThirdPartyProvider = (providerKey) => {
    return Object.prototype.hasOwnProperty.call(OPENAI_COMPATIBLE_PRESETS, providerKey);
  };

  // 获取支持 thinking/reasoning 的模型列表
  const getThinkingModels = () => [
    'deepseek-reasoner',
    'o1',
    'o3-mini',
    'kimi-k2-thinking',
  ];

  // 检查模型是否支持 thinking/reasoning
  const isThinkingModel = (model) => {
    const normalized = normalizeText(model).toLowerCase();
    return getThinkingModels().some((m) => normalized.includes(m.toLowerCase()));
  };

  // 为不同提供商构建特定的请求体
  const buildProviderSpecificPayload = (basePayload, providerType, baseUrl) => {
    const normalizedProvider = normalizeText(providerType).toLowerCase();
    const normalizedBaseUrl = normalizeBaseUrlForStorage(baseUrl || '').toLowerCase();

    const payload = { ...basePayload };

    // DeepSeek 特殊处理
    if (normalizedProvider === 'deepseek' || /deepseek/.test(normalizedBaseUrl)) {
      if (isThinkingModel(payload.model)) {
        payload.thinking = { type: 'enabled' };
      }
    }

    // Kimi 特殊处理
    if (normalizedProvider === 'kimi' || /moonshot/.test(normalizedBaseUrl)) {
      // Kimi 可能需要的特殊参数
      if (isThinkingModel(payload.model)) {
        payload.temperature = 0.7;
      }
    }

    // OpenAI o1/o3 系列特殊处理
    if (normalizedProvider === 'openai' || /openai\.com/.test(normalizedBaseUrl)) {
      if (isThinkingModel(payload.model)) {
        // o1/o3 系列不支持 temperature/top_p
        delete payload.temperature;
        delete payload.top_p;
      }
    }

    return payload;
  };

  // 获取提供商的名称和图标（用于UI）
  const getProviderDisplayInfo = (providerKey) => {
    const preset = OPENAI_COMPATIBLE_PRESETS[providerKey];
    if (!preset) {
      return { label: providerKey, icon: '🤖', color: '#666' };
    }

    const icons = {
      openai: { icon: '🅾️', color: '#10a37f' },
      deepseek: { icon: '🐋', color: '#4d6bfa' },
      kimi: { icon: '🌙', color: '#6b5ce7' },
      glm: { icon: '🧠', color: '#2563eb' },
      qwen: { icon: '☁️', color: '#ff6a00' },
      doubao: { icon: '🫘', color: '#1a94ff' },
      minimax: { icon: '🎭', color: '#ff6b6b' },
      siliconflow: { icon: '⛰️', color: '#7c3aed' },
      custom: { icon: '⚙️', color: '#6b7280' },
    };

    const iconInfo = icons[preset.key] || { icon: '🤖', color: '#666' };
    return {
      label: preset.label,
      icon: iconInfo.icon,
      color: iconInfo.color,
    };
  };

  return {
    DEFAULT_PLATO_BASE_URL,
    DEFAULT_PLATO_CHAT_MODELS,
    OPENAI_COMPATIBLE_PRESETS,
    normalizeText,
    normalizeBaseUrlForStorage,
    buildChatCompletionsEndpoint,
    sanitizeModelList,
    resolveChatModels,
    resolveSummaryLLM,
    inferProviderType,
    getOpenAICompatiblePreset,
    inferChatApiProfile,
    shouldUseXApiKeyHeader,
    buildStreamingChatPayload,
    buildConnectivityTestPayload,
    // 新增导出
    getAllProviderPresets,
    getDefaultModelForProvider,
    isValidThirdPartyProvider,
    getThinkingModels,
    isThinkingModel,
    buildProviderSpecificPayload,
    getProviderDisplayInfo,
  };
});
