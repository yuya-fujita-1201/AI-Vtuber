# Day 21: Topic History System Utilization

## 📝 Objective

Leverage the `TopicHistory` table to make the agent aware of its own conversational history. This will enable the agent to make meta-remarks about past discussions, adding a new layer of depth and continuity to its personality.

## 🎯 Deliverables

1.  **New `TopicService` (`src/services/TopicService.ts`)**
    *   A service to manage records in the `TopicHistory` table.
    *   It will have methods like `getTopicHistory(topicName: string)` and `updateTopicMention(topicName: string, viewerId: string)`.

2.  **Integration with `Agent.ts`**
    *   After a topic is identified by the `LLMClassifierService`, the `Agent` will call the `TopicService` to log the mention.

3.  **PromptManager Enhancement (`src/core/PromptManager.ts`)**
    *   Before generating a reply, the `PromptManager` will fetch the history for the current topic using the `TopicService`.
    *   It will then inject a summary of this history into the system prompt (e.g., "CONTEXT: You have discussed the topic 'React' 3 times before. The last time was yesterday. The general sentiment was positive.").

## 🛠️ Implementation Specs

*   **Topic Normalization**: The `TopicService` should have a mechanism to normalize topic names to avoid creating duplicate entries (e.g., "React" and "ReactJS" should be treated as the same topic).
*   **Prompt Injection**: The injected context should be concise and directly useful for the LLM. It should guide the LLM to acknowledge the past conversation without being overly repetitive.
*   **Performance**: Fetching topic history should be a quick operation. Ensure the `topicName` column is properly indexed.

## ✅ Verification

*   [ ] When a topic is discussed for the first time, a new record is created in the `TopicHistory` table.
*   [ ] When the same topic is discussed again, the agent's response acknowledges the previous conversation (e.g., "Ah, we're talking about React again! I remember we discussed hooks last time.").
*   [ ] The `totalMentions` and `lastDiscussedAt` fields in the database are correctly updated after each mention.
*   [ ] The agent can, when prompted, recall how many times a topic has been discussed.
