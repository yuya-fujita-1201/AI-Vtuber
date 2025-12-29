# Day 16: Comment Processing Stabilization

## 📝 Objective

Address the "All-Reply Problem" identified in `docs/feedback_ja.md` by implementing a more robust comment processing system. This will improve the application's stability under heavy comment load and increase its resilience to external API failures.

## 🎯 Deliverables

1.  **Asynchronous Comment Queue (`src/core/Agent.ts`)**
    *   Implement a dedicated queue for incoming comments.
    *   Create a separate asynchronous worker loop that processes comments from the queue at a throttled pace (e.g., one comment every 2-3 seconds).
    *   This decouples comment fetching from comment processing, preventing the main agent loop from blocking.

2.  **Enhanced LLM Request Logic (`src/services/OpenAIService.ts`, `src/services/GroqService.ts`)**
    *   Add a clear timeout (e.g., 15 seconds) to all LLM API requests.
    *   Implement an exponential backoff retry mechanism for transient errors (e.g., 5xx status codes, network errors, timeouts).
    *   The retry logic should attempt a request up to 3 times before failing.

## 🛠️ Implementation Specs

*   **Throttling**: The comment processing interval should be configurable in `AppConfig.ts`.
*   **Queue Management**: The queue should have a maximum size to prevent memory overflow. If the queue is full, new comments can be dropped with a log warning.
*   **Retry Logic**: Use a helper function or a lightweight library concept to handle the retry and backoff logic cleanly.

## ✅ Verification

*   [ ] Under a simulated flood of comments (using a modified test script), the agent maintains a steady response rate without significant lag.
*   [ ] Simulating a temporary LLM API failure (e.g., using a mock server that returns a 503 error) shows the retry mechanism in action in the logs.
*   [ ] The agent successfully recovers and responds once the simulated API failure is resolved.
*   [ ] A prolonged API failure results in a final fallback response after all retry attempts are exhausted.
