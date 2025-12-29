# Day 23: Automatic Viewer Profile Generation

## 📝 Objective

To deepen the agent's relationship with its audience, implement a system that automatically generates and utilizes profiles for individual viewers. This will allow the agent to remember personal details and preferences, creating a highly personalized experience.

## 🎯 Deliverables

1.  **New `ViewerProfileService` (`src/services/ViewerProfileService.ts`)**
    *   A service to manage the `ViewerProfile` table.
    *   It will include a method `updateProfile(viewerId: string, message: string)` that uses an LLM to extract key facts and preferences from a user's message.

2.  **Integration with `Agent.ts`**
    *   After processing a comment, the `Agent` will asynchronously call the `ViewerProfileService` to update the profile of the commenter.

3.  **PromptManager Enhancement (`src/core/PromptManager.ts`)**
    *   When replying to a specific user, the `PromptManager` will fetch their profile from the `ViewerProfileService`.
    *   It will then inject relevant facts into the prompt (e.g., "REMINDER: The user you are replying to, @John, has mentioned they own a cat named Whiskers.").

## 🛠️ Implementation Specs

*   **Profile Extraction Prompt**: A specialized LLM prompt is needed to extract structured data from user comments, such as mentioned facts (e.g., pets, job, hobbies) and preferences.
*   **Asynchronous Update**: Updating the viewer profile should not block the agent's main reply loop. It should be a fire-and-forget background task.
*   **Data Injection**: The injected profile data should be used subtly to guide the LLM, enabling it to naturally weave the information into the conversation.

## ✅ Verification

*   [ ] When a user mentions a personal detail (e.g., "I just got a new puppy!"), a corresponding fact is created in their `ViewerProfile`.
*   [ ] In a subsequent interaction, the agent's reply references this detail (e.g., "How is your new puppy doing?").
*   [ ] The database correctly stores and updates profiles for multiple different viewers.
*   [ ] The profile update process is confirmed to be non-blocking via logs.
