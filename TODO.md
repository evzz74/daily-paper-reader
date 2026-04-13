# TODO

## 已完成

### 工作流 LLM 配置支持非 BLT 提供商

- 已支持在前端配置工作流使用 `BLT` 或自定义 `OpenAI-compatible` 提供商。
- 工作流测试、Secrets 保存、运行时 summary 调用现在都会使用用户填写的 `Base URL / Model / API Key`。
- 后端 `src/llm.py` 已补齐 `GenericOpenAIClient`，并修复 `LLMClient` 定义顺序导致的导入错误。
- `daily-paper-reader.yml` 与 `user-upload-summary.yml` 已支持新的通用环境变量链路。

### 第三方模型兼容性

- 已兼容 Kimi / Moonshot 等只允许固定温度的模型，请求会自动归一到 `temperature=1`。
- 已区分 workflow 测试和 chat 测试，避免配置混用。

### 用户上传文献工作流

- 上传确认后，文件会直接写入仓库 `docs/user-uploads/files/`。
- 同时写入 `meta/*.json`、占位页 `docs/user-uploads/<file_id>.md` 和上传索引页。
- 上传完成后会立即触发独立 workflow `user-upload-summary`。
- workflow 会读取上传文件内容，生成速览摘要和详细总结，并回写页面。
- 总结完成后会同步更新：
  - `docs/user-uploads/README.md`
  - `docs/README.md`
  - `docs/_sidebar.md`
- 前端上传完成后会自动跳转到新上传文献页，降低”上传后找不到文件”的问题。
- 总结 prompt 与日报推荐对齐：速览（tldr 100字完整概述）、详细总结（8维度：核心问题、方法论、实验设计、算力、实验充分性、结论、优点、不足）。

## 当前待处理

### 用户上传链路

- [ ] 前端增加对 `user-upload-summary` workflow 状态的轮询或回显，不再只依赖本地 `queued/done` 状态。
- [ ] 上传列表改为优先读取仓库索引，再回退到 `localStorage`，避免跨设备或刷新后状态不一致。
- [ ] 为上传失败场景补充回滚或重试策略，避免 source/meta/page/index 部分写入成功、部分失败。
- [ ] 为 `src/user_upload_summary.py` 增加更明确的日志：文件路径、提取文本长度、模型调用阶段、回写结果。
- [ ] 支持更多文件类型或明确 OCR 降级策略，避免扫描版 PDF 无法提取文本时体验过差。

### 文档与交互

- [ ] 补充“上传文献模式”的使用教程截图与故障排查说明。
- [ ] 在首页区分“日报推荐”和“我的上传文献”，避免入口过多时信息混杂。
- [ ] 为首页和侧边栏的上传区块增加数量上限与“查看全部”提示的视觉优化。

### 多源论文推荐接入

#### 目标

- [ ] 将推荐候选从单一 `arXiv / OpenReview` 扩展为多源聚合。
- [ ] 保持现有 BM25、embedding、排序、LLM refine、docs 生成主链路可复用。

#### 数据模型统一

- [ ] 为论文池补充统一字段：`source`、`source_id`、`doi`、`canonical_url`、`pdf_url`。
- [ ] 增加跨源外部 ID 字段：`arxiv_id`、`openalex_id`、`semantic_scholar_id`、`pmid`、`pmcid`、`dblp_id`。
- [ ] 设计跨源去重规则：优先 DOI / arXiv ID / PMID / PMCID，其次标题 + 年份近似匹配。
- [ ] 让非 arXiv 论文也能安全进入后续推荐与文档生成流程。

#### 抓取与召回

- [ ] 新增“多源 query 驱动抓取层”，按关键词 / intent queries 从外部学术源拉取候选。
- [ ] 保留 arXiv 现有全局抓取能力，同时允许外部来源作为补充候选池。
- [ ] 为每个来源增加独立的超时、重试、限流与开关配置。

#### 待接入渠道

- [ ] OpenAlex
- [ ] Semantic Scholar
- [ ] PubMed
- [ ] Papers with Code
- [ ] CrossRef
- [ ] Europe PMC
- [ ] bioRxiv
- [ ] DBLP

#### 下游兼容

- [ ] 让 `Step 1` 原始论文池支持多源混合输出。
- [ ] 让 BM25 / embedding 检索保留并透传来源信息。
- [ ] 让排序与 LLM refine 能识别多源论文而不是默认 arXiv。
- [ ] 让 docs 生成在缺少 PDF 时支持降级：abstract-only / external-link-only。
- [ ] 让侧边栏与论文页展示真实来源，而不是默认显示 arXiv。

#### 测试与验收

- [ ] 为多源论文池解析增加单元测试。
- [ ] 为跨源去重规则增加单元测试。
- [ ] 为非 arXiv 论文进入推荐链路增加回归测试。
- [ ] 为 docs 生成的无 PDF 降级路径增加测试。
