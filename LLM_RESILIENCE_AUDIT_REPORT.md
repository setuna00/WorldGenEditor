# LLM Resilience Layer 系统性审计报告

**审计日期**: 2024-12-19  
**审计范围**: LLM Resilience Layer 实施验证  
**目标**: 确认5个核心不变量是否成立，找出可能导致bug/统计失真/绕过调度的地方

---

## ✅/❌ 不变量核查表

### A. 全局入口与调用链核查

**状态**: ✅ **基本通过，但有遗留问题**

#### 调用链验证结果

**所有LLM调用入口点**:
1. ✅ `aiWorldBuilder.ts` - 所有调用通过 `orchestrator.generateStructuredData()` (行234, 256, 280, 309, 393)
2. ✅ `GenerationEngine.tsx` - 通过 `orchestrator.generateBatch()` (行254)
3. ✅ `aiWorldBuilderEnhanced.ts` - 通过 `orchestrator.generateStructuredData()` (行607, 660)

**直接调用Provider的发现**:
- ❌ **P0问题**: `AIServiceContext.tsx` 仍暴露 `provider` 和 `useAIProvider()` hook (行28-29, 161-164)
  - 虽然标记为 `@deprecated`，但代码仍可访问
  - **证据**: `WorldGenEditor/src/contexts/AIServiceContext.tsx:28-29, 161-164`
  - **影响**: 调用方可能绕过orchestrator直接使用provider
  - **修复建议**: 移除 `provider` 字段和 `useAIProvider()` hook，或抛出错误强制使用orchestrator

**Provider实例化位置**:
- ✅ `providers/index.ts` - 仅在factory中 (行46-56)
- ✅ `AIServiceContext.tsx` - 仅用于创建orchestrator的依赖，不直接暴露 (行89-104)

**Provider内部retry逻辑检查**:
- ✅ `providers/openai.ts` - 无retry/backoff逻辑
- ✅ `providers/gemini.ts` - 无retry/backoff逻辑
- ✅ `providers/deepseek.ts` - 无retry/backoff逻辑
- ✅ `providers/claude.ts` - 无retry/backoff逻辑

**调用链图**:
```
调用方 (aiWorldBuilder/GenerationEngine)
  ↓
orchestrator.generateStructuredData/generateBatch
  ↓
retryManager.withRetry
  ↓
scheduler.schedule (每次attempt都经过)
  ↓
provider.generateStructuredData/generateBatch (单次请求，无retry)
```

**遗留问题**:
- ~~⚠️ **P1**: Providers仍使用独立的 `rateLimiter`~~ ✅ **已修复** (2024-12-19)
  - 已移除所有 provider 中的 rateLimiter，现在完全依赖 scheduler 的 rate limit

---

### B. Orchestrator 行为核对

**状态**: ⚠️ **部分问题**

#### 1. Attempts统计

**当前实现**:
- ✅ `retryManager.ts:322` - attemptNumber在API调用前递增
- ✅ `orchestrator.ts:378` - `telemetry.totalAttempts++` 在 `onAttemptComplete` 回调中递增
- ✅ `orchestrator.ts:373-389` - 每次真实API attempt都调用 `onAttemptComplete`

**问题**:
- ❌ **P1**: `telemetry.totalAttempts` 在 `onAttemptComplete` 中递增，但 `onAttemptComplete` 在retryManager的每次attempt后调用
  - **证据**: `WorldGenEditor/src/services/ai/orchestrator.ts:373-389`
  - **验证**: ✅ 正确 - retryManager每次attempt都通过scheduler，所以统计正确

#### 2. Circuit Breaker

**当前实现**:
- ✅ `orchestrator.ts:375` - 每次attempt完成后调用 `circuitBreaker.recordOutcome(circuitKey, error)`
- ✅ `circuitBreaker.ts:156` - 只统计 `countsForCircuitBreaker(error) === true` 的错误
- ✅ `errors.ts:70` - RETRYABLE_PARSE的 `countsForCircuitBreaker: false` (正确)

**问题**: 无

#### 3. Fallback

**当前实现**:
- ✅ `orchestrator.ts:437` - 使用 `fallbackRouter.shouldFallback()` 判断
- ✅ `fallbackRouter.ts:227` - 检查 `isFallbackAllowed(error)`
- ✅ `errors.ts:44-45` - AUTH/SAFETY的 `fallbackAllowed: false` (正确)
- ✅ `fallbackRouter.ts:276-291` - QUOTA错误时跳过相同provider的其他model

**问题**: 无

#### 4. Abort/Timeout

**当前实现**:
- ✅ `orchestrator.ts:371` - signal传递给retryManager
- ✅ `retryManager.ts:340` - signal传递给scheduler
- ✅ `scheduler.ts:301` - signal传递给execute函数
- ✅ `scheduler.ts:566-703` - timeout使用AbortController，与external signal合并
- ✅ `providers/openai.ts:137` - OpenAI SDK支持signal
- ⚠️ `providers/gemini.ts:130` - 使用 `raceWithAbort` (软取消，不停止服务器端计算)

**问题**:
- ~~⚠️ **P2**: Gemini provider的abort是"软取消"~~ ✅ **已文档化** (2024-12-19)
  - 详见 `docs/LLM_PROVIDER_NOTES.md`
  - 当前 UI 在构建过程中禁用取消按钮，避免用户误操作

---

### C. Scheduler 行为核对

**状态**: ✅ **通过**

#### 1. Rate Limit等待

**当前实现**:
- ✅ `scheduler.ts:259-262` - rate limit等待在获取slot之前
- ✅ `scheduler.ts:431` - rate limit等待可被AbortSignal中止 (`abortableSleep`)
- ✅ `scheduler.ts:400-442` - 使用mutex防止并发race condition

**问题**: 无

#### 2. Timeout/Cancel时Slot释放

**当前实现**:
- ✅ `scheduler.ts:602, 627, 642` - 所有异常路径都调用 `releaseSlot(provider)`
- ✅ `scheduler.ts:284` - 取消后立即释放slot

**问题**: 无

#### 3. 错误分类

**当前实现**:
- ✅ `scheduler.ts:316-343` - 只标记TIMEOUT/CANCELLED，其他错误返回原始error
- ✅ `scheduler.ts:688-701` - 不默认包装为RETRYABLE_TRANSIENT

**问题**: 无

#### 4. 统计字段

**当前实现**:
- ✅ `scheduler.ts:56-59` - 提供 `rateLimitWaitMs`, `slotWaitMs`, `executionTimeMs`
- ~~⚠️ **P1**: telemetry中timing字段被硬编码为0~~ ✅ **已修复** (2024-12-19)
  - 现在 `retryManager` 通过 `onAttemptComplete` 回调传递完整的 timing 信息
  - `orchestrator` 使用这些真实值填充 telemetry

---

### D. errors.ts / 错误分类核对

**状态**: ✅ **通过**

#### 错误分类完整性

**当前实现**:
- ✅ `errors.ts:16-24` - 定义了所有8种错误类别
- ✅ `errors.ts:41-82` - CATEGORY_FLAGS正确映射
- ✅ `errors.ts:192-320` - ERROR_PATTERNS覆盖所有场景
- ✅ `errors.ts:330-343` - classifyError函数实现完整

**countsForCircuitBreaker**:
- ✅ `errors.ts:65` - RETRYABLE_TRANSIENT: true
- ✅ `errors.ts:70` - RETRYABLE_PARSE: false (正确，parse错误不应触发breaker)
- ✅ `errors.ts:75` - TIMEOUT: true

**Parse Error Repair**:
- ✅ `retryManager.ts:186-206` - RETRYABLE_PARSE有特殊处理
- ✅ `retryManager.ts:198` - 第二次parse attempt启用repair mode
- ✅ `retryManager.ts:188` - 有 `maxParseRetries` 限制

**问题**: 无

---

### E. Build Pipeline 核对（数据安全与幂等）

**状态**: ✅ **通过**

#### 1. Seeds持久化幂等性

**当前实现**:
- ✅ `buildPipeline.ts:564-581` - `generateSeedIdempotencyKey` 使用 `buildId:poolName:index`
- ✅ `buildPipeline.ts:410-425` - `recordPersistedSeed` 持久化到DB
- ✅ `buildPipeline.ts:431-433` - `isSeedPersisted` 快速内存检查
- ✅ `buildPipeline.ts:619-677` - `ImmediateSeedPersister.persistSeeds` 跳过已持久化的seeds
- ✅ `buildPipeline.ts:647` - 在持久化前检查idempotency

**问题**: 无

#### 2. BuildState节流写入

**当前实现**:
- ✅ `buildPipeline.ts:112-203` - `ThrottledPersister` 实现节流
- ✅ `buildPipeline.ts:144-160` - `flush()` 方法强制立即写入
- ✅ `aiWorldBuilderEnhanced.ts:168, 267, 298, 374, 424` - start/end强制flush

**问题**: 无

#### 3. Crash/Retry场景

**当前实现**:
- ✅ `buildPipeline.ts:309-341` - `BuildStateManager.restore()` 从DB加载persisted seed keys
- ✅ `buildPipeline.ts:328-333` - 恢复时加载所有已持久化的seed keys
- ✅ `aiWorldBuilderEnhanced.ts:365-370` - retry时使用restore恢复状态

**问题**: 无

#### 4. retryFailedPools跳过逻辑

**当前实现**:
- ✅ `aiWorldBuilderEnhanced.ts:339-341` - 只retry `incompletePools`
- ✅ `aiWorldBuilderEnhanced.ts:393-400` - 跳过 `infrastructurePersisted === true` 的pool
- ✅ `aiWorldBuilderEnhanced.ts:647` - `ImmediateSeedPersister` 自动跳过已持久化的seeds

**问题**: 无

---

## 🔴 仍存在的问题清单

### P0 - 会导致错误/绕过/数据重复

#### ~~P0-1: AIServiceContext仍暴露直接provider访问~~ ✅ 已修复 (2024-12-19)
- **状态**: ✅ **已修复**
- **修复内容**:
  1. 移除了 `provider` 字段从 `AIServiceContextType`
  2. 移除了 `useAIProvider()` hook
  3. 改为使用 `checkIsConfigured(settings)` 函数计算 `isConfigured`，不再依赖 provider 实例
  4. 修复了 `WorldForgeModal.tsx` 改用 `orchestrator` 而非 `provider`
- **验证**:
  - `rg "useAIProvider" WorldGenEditor/src -n` → 0 匹配
  - `rg "provider.*=.*useAIService" WorldGenEditor/src -n` → 0 匹配
  - 所有 linter 检查通过

---

### P1 - 统计失真

#### ~~P1-1: Orchestrator telemetry缺少真实的等待时间~~ ✅ 已修复 (2024-12-19)
- **状态**: ✅ **已修复**
- **修复内容**:
  1. 新增 `AttemptTimingInfo` 接口，包含 timing 详细信息
  2. 修改 `retryManager.ts` 的 `onAttemptComplete` 回调签名，传递完整的 timing 信息
  3. 在每次 attempt 完成时从 `TaskResult` 提取 `rateLimitWaitMs`, `slotWaitMs`, `executionTimeMs`
  4. 修改 `orchestrator.ts` 使用新签名，填充真实的 timing 数据到 telemetry
- **验证**:
  - `rg "queueWaitMs:\s*0|slotWaitMs:\s*0|apiDurationMs:\s*0" WorldGenEditor/src/services/ai/orchestrator.ts` → 仅在 CIRCUIT_OPEN 分支有 0 值（预期行为）
  - 正常 attempt 的 timing 现在从 scheduler 的 TaskResult 获取真实值
  - 所有 linter 检查通过

#### ~~P1-2: Providers仍使用独立的rateLimiter~~ ✅ 已修复 (2024-12-19)
- **状态**: ✅ **已修复**
- **修复内容**:
  1. 移除了所有4个provider (openai.ts, deepseek.ts, gemini.ts, claude.ts) 中的 `getRateLimiter` import
  2. 移除了 `private rateLimiter: RateLimiter` 字段
  3. 移除了构造函数中的 `this.rateLimiter = getRateLimiter(...)` 初始化
  4. 移除了 `generateStructuredData` 和 `generateBatch` 中的 `await this.rateLimiter.enforce()` 调用
  5. 添加了注释说明 rate limiting 现在由 Scheduler 统一处理
- **验证**:
  - `rg "rateLimiter\.enforce|getRateLimiter" WorldGenEditor/src/services/ai/providers -n` → 0 匹配
  - 所有 linter 检查通过
- **Scheduler 配置验证**:
  - Scheduler 的 `DEFAULT_CONFIG.rateLimits` 包含所有 provider 的限流配置
  - Gemini: 14 req/60s, OpenAI/DeepSeek/Claude: 50 req/60s
  - 这些配置与之前 provider 内部的配置一致，确保行为不变

---

### P2 - 代码味道/潜在问题

#### ~~P2-1: Gemini provider的abort是"软取消"~~ ✅ 已文档化 (2024-12-19)
- **状态**: ✅ **已文档化**
- **说明**: Gemini SDK 不支持原生 `AbortSignal`，取消是客户端行为，服务器端继续执行并计费
- **文档化内容**:
  1. 创建 `docs/LLM_PROVIDER_NOTES.md`，详细说明各 provider 的取消行为差异
  2. 明确标注 Gemini 的 soft-cancel 限制和计费影响
  3. 在 README.md 中添加文档链接
- **当前 UI 状态**: 构建过程中取消按钮已禁用，用户无法在生成中途取消
- **未来改进**: 如需添加取消功能，应在 UI 中提示 Gemini 的计费限制

---

## 📋 执行过的搜索命令

1. `grep -r "\.generateStructuredData\(|\.generateBatch\(" WorldGenEditor/src`
2. `grep -r "new (GeminiProvider|OpenAIProvider|DeepSeekProvider|ClaudeProvider)" WorldGenEditor/src`
3. `grep -r "(while|for).*retry|MAX_RETRIES|backoff|sleep|setTimeout" WorldGenEditor/src/services/ai/providers -i`
4. `grep -r "provider\.(generate|call)" WorldGenEditor/src -i`
5. `grep -r "retryFailedPools|retry.*pool|skip.*infrastructure|skip.*seed" WorldGenEditor/src -i`
6. `grep -r "recordOutcome|attempts\+\+|totalAttempts" WorldGenEditor/src/services/ai`
7. `grep -r "onAttemptComplete" WorldGenEditor/src/services/ai`
8. `grep -r "provider\.(generate|call)|useAIProvider|\.provider\." WorldGenEditor/src -i`

---

## 📁 关键文件列表

### 已检查的核心文件

1. ✅ `src/services/ai/orchestrator.ts` - **核心，需重点审查**
2. ✅ `src/services/ai/scheduler.ts` - **核心，需重点审查**
3. ✅ `src/services/ai/errors.ts` - **核心，需重点审查**
4. ✅ `src/services/ai/retryManager.ts` - **核心，需重点审查**
5. ✅ `src/services/ai/circuitBreaker.ts` - **核心，需重点审查**
6. ✅ `src/services/ai/fallbackRouter.ts` - **核心，需重点审查**
7. ✅ `src/services/ai/buildPipeline.ts` - **核心，需重点审查**
8. ✅ `src/contexts/AIServiceContext.tsx` - **有问题，需修复**
9. ✅ `src/services/aiWorldBuilder.ts` - **调用方，正确使用orchestrator**
10. ✅ `src/pages/GenerationEngine.tsx` - **调用方，正确使用orchestrator**
11. ✅ `src/services/ai/providers/openai.ts` - **无retry逻辑，但有rateLimiter问题**
12. ✅ `src/services/ai/providers/gemini.ts` - **无retry逻辑，但有abort限制**
13. ✅ `src/services/ai/providers/deepseek.ts` - **无retry逻辑**
14. ✅ `src/services/ai/providers/claude.ts` - **无retry逻辑**
15. ✅ `src/services/ai/rateLimiter.ts` - **遗留，应移除**
16. ✅ `src/services/aiWorldBuilderEnhanced.ts` - **正确实现幂等和持久化**

### 建议在新对话中上传的文件（如需进一步调试）

**优先级高**:
- `src/services/ai/orchestrator.ts` - 修复P1-1需要修改
- `src/contexts/AIServiceContext.tsx` - 修复P0-1需要修改
- `src/services/ai/providers/openai.ts` - 修复P1-2需要修改
- `src/services/ai/providers/gemini.ts` - 修复P1-2需要修改

**优先级中**:
- `src/services/ai/retryManager.ts` - 如需传递TaskResult详细信息

---

## 📊 总结

### 总体评估

**核心不变量状态**:
- ✅ **不变量1**: Providers内部无retry/backoff - **成立**
- ✅ **不变量2**: 所有调用方走Orchestrator - **基本成立**（有遗留deprecated接口）
- ✅ **不变量3**: Scheduler只做队列/并发/限流/timeout - **成立**
- ✅ **不变量4**: 错误分类统一在errors.ts - **成立**
- ✅ **不变量5**: Build pipeline幂等和持久化 - **成立**

**发现的问题**:
- **P0问题**: ~~1个~~ → 0个 ✅ (P0-1 已修复)
- **P1问题**: ~~2个~~ → 0个 ✅ (P1-1, P1-2 均已修复)
- **P2问题**: ~~1个~~ → 0个 ✅ (P2-1 已文档化)

**建议优先级**:
1. ~~**立即修复**: P0-1（移除deprecated provider访问）~~ ✅ 已完成
2. ~~**尽快修复**: P1-2（移除provider rateLimiter）~~ ✅ 已完成
3. ~~**尽快修复**: P1-1（填充真实telemetry数据）~~ ✅ 已完成
4. ~~**文档化**: P2-1（Gemini abort限制）~~ ✅ 已完成

### 代码质量评估

**优点**:
- ✅ 架构清晰，职责分离良好
- ✅ 错误分类完整且正确
- ✅ 幂等性实现完善
- ✅ 持久化策略合理（seeds立即，state节流）

**需要改进**:
- ~~⚠️ 遗留的deprecated接口应完全移除~~ ✅ 已完成
- ~~⚠️ Telemetry数据不完整 (P1-1)~~ ✅ 已完成
- ~~⚠️ Provider内部仍有重复的rate limit逻辑 (P1-2)~~ ✅ 已完成

---

**审计完成时间**: 2024-12-19  
**审计人**: AI Code Auditor  
**下次审计建议**: 修复P0和P1问题后重新审计

