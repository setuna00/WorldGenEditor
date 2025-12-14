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
- ⚠️ **P1**: Providers仍使用独立的 `rateLimiter` (openai.ts:57, gemini.ts:58)
  - **证据**: `WorldGenEditor/src/services/ai/providers/openai.ts:57-60`, `gemini.ts:58-61`
  - **影响**: 与scheduler的rate limit可能重复/冲突
  - **修复建议**: 移除provider内部的rateLimiter，完全依赖scheduler的rate limit

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
- ⚠️ **P2**: Gemini provider的abort是"软取消"，服务器端请求继续执行和计费
  - **证据**: `WorldGenEditor/src/services/ai/providers/gemini.ts:115-118, 149-176`
  - **影响**: 用户取消后仍可能被计费
  - **修复建议**: 文档化此限制，或考虑使用支持真正取消的Gemini API版本

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
- ⚠️ **P1**: `orchestrator.ts:384-387` - telemetry中的这些字段被硬编码为0
  - **证据**: `WorldGenEditor/src/services/ai/orchestrator.ts:384-387`
  - **影响**: 无法获取真实的等待时间统计
  - **修复建议**: 从retryManager的TaskResult中提取这些字段并填充到telemetry

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

#### P0-1: AIServiceContext仍暴露直接provider访问
- **文件**: `WorldGenEditor/src/contexts/AIServiceContext.tsx`
- **行号**: 28-29, 161-164
- **证据**:
  ```typescript
  // 行28-29
  provider: AIProvider;  // @deprecated但仍在
  // 行161-164
  export const useAIProvider = (): AIProvider => {
      const { provider } = useAIService();
      return provider;
  };
  ```
- **影响**: 调用方可能绕过orchestrator，直接使用provider，导致：
  - 绕过retry/fallback/circuit breaker
  - 绕过rate limit和并发控制
  - 统计失真
- **修复建议**: 
  1. 移除 `provider` 字段
  2. 移除 `useAIProvider()` hook
  3. 或改为抛出错误，强制使用 `useOrchestrator()`

---

### P1 - 统计失真

#### P1-1: Orchestrator telemetry缺少真实的等待时间
- **文件**: `WorldGenEditor/src/services/ai/orchestrator.ts`
- **行号**: 384-387
- **证据**:
  ```typescript
  telemetry.attempts.push({
      providerKey,
      attemptNumber,
      success: error === null,
      errorCategory: error?.category,
      queueWaitMs: 0,  // ❌ 硬编码为0
      slotWaitMs: 0,    // ❌ 硬编码为0
      apiDurationMs: 0, // ❌ 硬编码为0
      timestamp: Date.now()
  });
  ```
- **影响**: 无法获取真实的rate limit等待、slot等待、API执行时间，影响性能分析和优化
- **修复建议**: 
  1. 修改 `retryManager.withRetry` 返回TaskResult的详细信息
  2. 或在 `onAttemptComplete` 回调中传递TaskResult
  3. 从TaskResult中提取 `rateLimitWaitMs`, `slotWaitMs`, `executionTimeMs` 并填充到telemetry

#### P1-2: Providers仍使用独立的rateLimiter
- **文件**: `WorldGenEditor/src/services/ai/providers/openai.ts`, `gemini.ts`
- **行号**: openai.ts:57-60, gemini.ts:58-61
- **证据**:
  ```typescript
  // openai.ts:57-60
  this.rateLimiter = getRateLimiter('OpenAI', {
      maxRequests: rateConfig.maxRequests,
      windowMs: rateConfig.windowMs
  });
  // 然后在 generateStructuredData/generateBatch 中调用
  await this.rateLimiter.enforce();
  ```
- **影响**: 
  - 与scheduler的rate limit可能重复等待
  - 两个rate limiter状态不同步，可能导致实际请求超过限制
  - 统计失真（scheduler统计的请求数 vs 实际发出的请求数）
- **修复建议**: 
  1. 移除provider内部的 `rateLimiter.enforce()` 调用
  2. 完全依赖scheduler的rate limit控制
  3. 保留rateLimiter实例仅用于向后兼容（如果其他地方依赖）

---

### P2 - 代码味道/潜在问题

#### P2-1: Gemini provider的abort是"软取消"
- **文件**: `WorldGenEditor/src/services/ai/providers/gemini.ts`
- **行号**: 115-118, 149-176
- **证据**:
  ```typescript
  // 行115-118
  // Gemini SDK doesn't natively support AbortSignal.
  // Implement "soft-cancel": race between API call and abort signal.
  // NOTE: This does NOT stop server-side computation or billing.
  // The request continues on Google's servers even after client-side abort.
  ```
- **影响**: 用户取消后仍可能被计费，用户体验不佳
- **修复建议**: 
  1. 在文档中明确说明此限制
  2. 考虑在UI中提示用户Gemini请求取消后仍可能计费
  3. 或研究Gemini API是否有支持真正取消的版本

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
- **P0问题**: 1个（直接provider访问仍暴露）
- **P1问题**: 2个（统计失真）
- **P2问题**: 1个（Gemini abort限制）

**建议优先级**:
1. **立即修复**: P0-1（移除deprecated provider访问）
2. **尽快修复**: P1-1（填充真实telemetry数据），P1-2（移除provider rateLimiter）
3. **文档化**: P2-1（Gemini abort限制）

### 代码质量评估

**优点**:
- ✅ 架构清晰，职责分离良好
- ✅ 错误分类完整且正确
- ✅ 幂等性实现完善
- ✅ 持久化策略合理（seeds立即，state节流）

**需要改进**:
- ⚠️ 遗留的deprecated接口应完全移除
- ⚠️ Telemetry数据不完整
- ⚠️ Provider内部仍有重复的rate limit逻辑

---

**审计完成时间**: 2024-12-19  
**审计人**: AI Code Auditor  
**下次审计建议**: 修复P0和P1问题后重新审计

