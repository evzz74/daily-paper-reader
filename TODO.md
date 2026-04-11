# TODO

## 工作流 LLM 配置支持非 BLT 提供商（已完成）

### 已完成的修改

#### 1. 后端代码修改

| 文件 | 修改内容 |
|------|----------|
| `src/llm.py` | - 新增 `GenericOpenAIClient` 类，支持任意 OpenAI-compatible 提供商<br>- 添加 `LLMClient.rerank()` 方法，支持 LLM-based rerank 回退机制<br>- `ClientFactory.from_env()` 现在支持任意提供商（不再抛出"不支持的提供商"错误） |
| `src/main.py` | - `resolve_summary_step_env()` 现在支持非 BLT 提供商，自动设置 `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` 环境变量<br>- `should_skip_rerank()` 不再强制跳过非 BLT 提供商（rerank 现在支持通用客户端） |
| `src/3.rank_papers.py` | - 支持 BLT 和通用客户端自动判断<br>- 新增 `LLM_API_KEY`, `OPENAI_API_KEY` 支持<br>- 非 BLT 提供商使用 `GenericOpenAIClient` 进行 rerank |
| `src/4.llm_refine_papers.py` | - 支持通用 OpenAI-compatible 客户端进行论文过滤<br>- API Key 支持 `BLT_API_KEY` 或 `LLM_API_KEY` |
| `src/6.generate_docs.py` | - 新增 `_create_llm_client()` 函数，自动判断使用 BLT 或通用客户端<br>- 支持通过环境变量配置任意提供商进行文档生成 |
| `src/0.enrich_config_queries.py` | - 支持通用 OpenAI-compatible 客户端进行查询改写<br>- 自动检测提供商类型并创建相应客户端 |

#### 2. GitHub Actions 工作流修改

`.github/workflows/daily-paper-reader.yml`：
- 新增 `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` 环境变量
- 新增 `OPENAI_API_KEY` 支持
- 所有配置都向后兼容，优先使用新的通用配置，回退到 BLT 配置

#### 3. 前端配置修改

`app/secret.session.js`：
- 工作流配置区域新增"使用 BLT"和"使用自定义 OpenAI-compatible"单选按钮
- 新增 Base URL 输入框（自定义提供商时显示）
- 新增自定义模型名称输入框（自定义提供商时显示，用户可自由输入如 `gpt-4o-mini`）
- BLT 模式显示预设模型下拉选择框（gpt-5-chat、Gemini 3 Flash 等）
- 保存配置时同时写入 `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `OPENAI_API_KEY` 等 Secrets

### 使用方法

部署后，用户在密钥配置向导中：

1. **选择"使用 BLT（柏拉图）"**
   - 从下拉列表选择预设模型（gpt-5-chat、Gemini 3 Flash、DeepSeek V3 等）
   - 使用 BLT 的 /rerank 端点

2. **选择"使用自定义 OpenAI-compatible"**
   - 输入 Base URL（如 `https://api.openai.com/v1`）
   - 输入模型名称（如 `gpt-4o-mini`、`deepseek-chat`、`kimi-k2.5` 等）
   - 使用 LLM-based rerank（通过 chat API 为文档评分）

### 环境变量优先级

工作流中 LLM 配置的环境变量优先级：
1. `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`（新增，通用配置）
2. `SUMMARY_API_KEY` / `SUMMARY_BASE_URL` / `SUMMARY_MODEL`（向后兼容）
3. `BLT_API_KEY` / `BLT_PRIMARY_BASE_URL` / `BLT_SUMMARY_MODEL`（向后兼容）

---

## Skills 封装

- [ ] 新增项目内 skill：`.codex/skills/maintain-daily-paper-reader/SKILL.md`
- [ ] 在 skill 中沉淀仓库维护工作流：抓取、召回、排序、文档生成、前端工作流面板
- [ ] 明确 skill 使用边界：只读排查、流水线修改、workflow 修改、docs 生成修改
- [ ] 视稳定程度决定是否补充 `agents/openai.yaml`

## 多源论文推荐接入

### 目标

- [ ] 将推荐候选从单一 `arXiv / OpenReview` 扩展为多源聚合
- [ ] 保持现有 BM25、embedding、排序、LLM refine、docs 生成主链路可复用

### 数据模型统一

- [ ] 为论文池补充统一字段：`source`、`source_id`、`doi`、`canonical_url`、`pdf_url`
- [ ] 增加跨源外部 ID 字段：`arxiv_id`、`openalex_id`、`semantic_scholar_id`、`pmid`、`pmcid`、`dblp_id`
- [ ] 设计跨源去重规则：优先 DOI / arXiv ID / PMID / PMCID，其次标题 + 年份近似匹配
- [ ] 让非 arXiv 论文也能安全进入后续推荐与文档生成流程

### 抓取与召回

- [ ] 新增“多源 query 驱动抓取层”，按关键词 / intent queries 从外部学术源拉取候选
- [ ] 保留 arXiv 现有全局抓取能力，同时允许外部来源作为补充候选池
- [ ] 为每个来源增加独立的超时、重试、限流与开关配置

### 待接入渠道

- [ ] OpenAlex
- [ ] Semantic Scholar
- [ ] PubMed
- [ ] Papers with Code
- [ ] CrossRef
- [ ] Europe PMC
- [ ] bioRxiv
- [ ] DBLP

### 下游兼容

- [ ] 让 `Step 1` 原始论文池支持多源混合输出
- [ ] 让 BM25 / embedding 检索保留并透传来源信息
- [ ] 让排序与 LLM refine 能识别多源论文而不是默认 arXiv
- [ ] 让 docs 生成在缺少 PDF 时支持降级：abstract-only / external-link-only
- [ ] 让侧边栏与论文页展示真实来源，而不是默认显示 arXiv

### 测试与验收

- [ ] 为多源论文池解析增加单元测试
- [ ] 为跨源去重规则增加单元测试
- [ ] 为非 arXiv 论文进入推荐链路增加回归测试
- [ ] 为 docs 生成的无 PDF 降级路径增加测试

