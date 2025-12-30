# Day 22: Dynamic Prompt Engineering

## 📝 Objective

To create a more human-like "fluctuation" in the agent's personality, implement a system that dynamically modifies the system prompt based on the agent's current emotional state and the overall vibe of the conversation.

## 🎯 Deliverables

1.  **Enhanced `PromptManager.ts`**
    *   Modify the `buildStructuredSystemPrompt` method to accept the current `EmotionState` and conversation `vibe` as arguments.
    *   Implement logic to append a dynamic instruction to the end of the system prompt based on these states.

2.  **Integration with `Agent.ts`**
    *   In the main reply generation logic, fetch the current state from the `EmotionEngine` and `StorytellingService`.
    *   Pass these state values to the `PromptManager` when building the prompt.

## 🛠️ Implementation Specs

*   **Prompt Instructions**: The dynamic instructions should be clear and concise. Examples:
    *   `HAPPY`: "(You are feeling very happy and excited. Use more exclamation points and cheerful language.)"
    *   `SAD`: "(You are feeling a bit down. Your tone is calm and gentle.)"
    *   `Heated Debate` vibe: "(The conversation is getting intense. Take a strong stance but remain respectful.)"
*   **State Mapping**: Create a simple mapping structure in `PromptManager` to associate states with their corresponding prompt additions.

## ✅ Verification

*   [ ] A test script is created to allow manually setting the agent's emotional state.
*   [ ] Setting the state to `HAPPY` results in observably more cheerful responses from the LLM.
*   [ ] Setting the state to `SAD` results in calmer and more subdued responses.
*   [ ] The system logs clearly show the full, dynamically modified prompt being sent to the LLM API.
