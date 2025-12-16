# LLM Provider Notes

This document covers provider-specific behaviors and limitations that developers and users should be aware of.

---

## Cancellation Behavior

### Overview

When a user cancels an ongoing LLM generation request, the behavior varies by provider:

| Provider | Cancellation Type | Server-Side Behavior | Billing Impact |
|----------|-------------------|---------------------|----------------|
| OpenAI   | Hard cancel       | Request is aborted  | Stops billing  |
| DeepSeek | Hard cancel       | Request is aborted  | Stops billing  |
| Claude   | Hard cancel       | Request is aborted  | Stops billing  |
| **Gemini** | **Soft cancel** | **Request continues** | **May still bill** |

### Gemini: Soft Cancel ⚠️

**The Gemini SDK does not natively support `AbortSignal`.**

When you cancel a Gemini request:

1. **Client-side**: The application stops waiting for the response immediately
2. **Server-side**: The request **continues processing** on Google's servers
3. **Billing**: You **may still be charged** for the full request

#### Technical Details

The Gemini provider implements a "race with abort" pattern:

```typescript
// From gemini.ts
// Gemini SDK doesn't natively support AbortSignal.
// Implement "soft-cancel": race between API call and abort signal.
// NOTE: This does NOT stop server-side computation or billing.
// The request continues on Google's servers even after client-side abort.
```

This means:
- Cancellation is **client-side only**
- The actual API call runs to completion on Google's infrastructure
- Token usage and costs are incurred regardless of cancellation

#### Implications for Users

1. **Avoid frequent cancellations** when using Gemini - you're paying for the work anyway
2. **Consider using other providers** if you need reliable cancellation (OpenAI, Claude, DeepSeek all support true abort)
3. **Be aware of billing** - cancelling a long-running Gemini request doesn't save money

#### Future Improvements

If Google adds native `AbortSignal` support to the Gemini SDK, this limitation can be removed. Monitor the `@google/genai` package for updates.

---

## Rate Limiting

All providers use a unified rate limiting strategy through the **Scheduler**:

| Provider | Requests/Minute |
|----------|-----------------|
| Gemini   | 14              |
| OpenAI   | 50              |
| DeepSeek | 50              |
| Claude   | 50              |

Rate limiting is handled centrally by the Scheduler, not by individual providers.

---

## Error Handling

All providers use unified error classification through `errors.ts`:

- **AUTH**: Authentication failures (not retryable)
- **SAFETY**: Content safety violations (not retryable)
- **QUOTA**: Rate/quota limits (retryable with backoff)
- **NON_RETRYABLE**: Permanent failures
- **RETRYABLE_TRANSIENT**: Temporary failures (429, 5xx)
- **RETRYABLE_PARSE**: JSON parse failures (retry with repair mode)
- **TIMEOUT**: Request timeout
- **CANCELLED**: User cancellation

---

## Circuit Breaker

Each provider:model combination has an independent circuit breaker:

- **Threshold**: 5 failures in 60 seconds → circuit OPEN
- **Recovery**: After 30 seconds → circuit HALF_OPEN (allows one test request)
- **Success**: Test request succeeds → circuit CLOSED

Parse errors (`RETRYABLE_PARSE`) do **not** count toward circuit breaker failures.

---

*Last updated: 2024-12-19*
