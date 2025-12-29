# Day 27: Dynamic Configuration Reload

## 📝 Objective

To improve operational flexibility, implement a mechanism to reload parts of the application's configuration (like prompts and tuning parameters) without requiring a full restart.

## 🎯 Deliverables

1.  **New API Endpoint (`src/server/WebServer.ts`)**
    *   Create a new `POST /reload-config` endpoint.
    *   This endpoint will trigger the configuration reload process.

2.  **Reloadable Config Logic (`src/config/AppConfig.ts`)**
    *   Refactor the static config object into a class or a module with a `reload()` method.
    *   The `reload()` method will re-read relevant environment variables and configuration files (e.g., prompt templates).

3.  **Security Mechanism**
    *   The `/reload-config` endpoint must be protected.
    *   Implement a simple security measure, such as requiring a secret token in the `Authorization` header.

## 🛠️ Implementation Specs

*   **Scope**: Initially, focus on making prompt templates and numerical parameters (e.g., delays, thresholds) reloadable.
*   **Refactoring**: The `AppConfig` will likely need to be instantiated and passed around via dependency injection, rather than being a static import.
*   **Secret Management**: The secret token for the endpoint should be configured via an environment variable, e.g., `RELOAD_SECRET`.

## ✅ Verification

*   [ ] The application starts and runs normally after the `AppConfig` refactoring.
*   [ ] Modifying a prompt template on disk, then sending a request to `POST /reload-config` with the correct secret, causes the agent to immediately start using the new prompt.
*   [ ] Sending a request to the endpoint without the secret key (or with an incorrect one) results in a `401 Unauthorized` error.
*   [ ] The reload process is logged, indicating which parts of the configuration were updated.
