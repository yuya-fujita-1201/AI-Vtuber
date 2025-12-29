# Day 17: LLM-based Intent & Emotion Classifier

## 📝 Objective

Replace the rigid, rule-based `CommentRouter` and `IntentClassifier` with a single, intelligent `LLMClassifierService`. This new service will leverage a lightweight LLM to understand the nuances of user comments, providing a richer and more accurate classification of intent and emotion.

## 🎯 Deliverables

1.  **New `LLMClassifierService` (`src/services/LLMClassifierService.ts`)**
    *   This service will contain a method `classify(comment: string)`.
    *   It will call a lightweight LLM (e.g., `gpt-4o-mini`) using JSON mode to extract structured data.
    *   The output should be a defined interface, e.g., `ClassificationResult { intent: string[], emotion: { positive: number, negative: number, neutral: number }, topic: string }`.

2.  **Integration into `Agent.ts`**
    *   Replace the calls to the old `CommentRouter` and `IntentClassifier` with a single call to the new `LLMClassifierService`.
    *   The results from the new service should be used to drive the `EmotionEngine` and other downstream logic.

3.  **Deprecation of Old Components**
    *   Remove `src/core/CommentRouter.ts` and `src/core/IntentClassifier.ts` from the project.
    *   Update any import statements that reference the old files.

## 🛠️ Implementation Specs

*   **LLM & Prompt**: Use `gpt-4o-mini` for cost and speed. The system prompt for the classifier should be carefully engineered to request the specific JSON output format and provide examples.
*   **Error Handling**: The service must be resilient to malformed JSON responses from the LLM. Implement a validation step (e.g., using Zod) and a fallback mechanism.
*   **Interface**: Define a clear TypeScript interface for the `ClassificationResult` in `src/interfaces/index.ts`.

## ✅ Verification

*   [ ] A test script is created to feed various nuanced comments (e.g., sarcastic remarks, rhetorical questions, complex greetings) to the `LLMClassifierService`.
*   [ ] The service correctly outputs the expected structured JSON for each test case.
*   [ ] The `Agent` correctly processes the new classification result and updates its internal state (e.g., emotion score).
*   [ ] The old `CommentRouter.ts` and `IntentClassifier.ts` files are deleted, and the application compiles and runs without them.
