# Day 26: External Information Integration (News API)

## 📝 Objective

Break the agent out of its knowledge bubble by enabling it to access real-time, external information. As a first step, this task involves integrating a News API to allow the agent to discuss current events.

## 🎯 Deliverables

1.  **New `NewsApiService` (`src/services/NewsApiService.ts`)**
    *   A service that connects to a public News API (e.g., NewsAPI.org, GNews).
    *   It will have a method like `getTopHeadlines(query?: string)` that fetches recent news articles.
    *   The API key should be managed via the `.env` file.

2.  **Command Handler in `Agent.ts`**
    *   Implement a simple command detection mechanism in the main comment processing loop.
    *   When a comment contains a specific keyword (e.g., "今日のニュースは？" or `!news`), the agent will trigger the `NewsApiService`.

3.  **Prompt Integration (`src/core/PromptManager.ts`)**
    *   The fetched news headlines will be passed to the `PromptManager`.
    *   A new prompt section will be added to provide the news articles as context for the LLM to summarize and comment on.

## 🛠️ Implementation Specs

*   **API Choice**: Choose a News API that has a generous free tier for development.
*   **Command Detection**: The initial implementation can be a simple `includes()` check. A more advanced version could use the `LLMClassifierService` to detect the intent to ask about news.
*   **Output Formatting**: The LLM should be prompted to provide a concise summary of the news, not just repeat the headlines. It should then transition back to the main conversation.

## ✅ Verification

*   [ ] A user comment like "何か面白いニュースある？" triggers a call to the News API.
*   [ ] The agent responds with a summary of recent news headlines.
*   [ ] The entire process, from comment to news-based response, is completed within a reasonable time frame (e.g., under 20 seconds).
*   [ ] If the News API fails, the agent provides a graceful fallback message (e.g., "ごめんなさい、今ニュースを取得できませんでした").
