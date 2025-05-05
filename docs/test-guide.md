# Testing Guide

This document provides instructions on how to run the automated tests for the `ai-chatbot` project.

## Test Framework

The project uses [Playwright](https://playwright.dev/) for end-to-end (E2E) testing.

## Prerequisites

1.  **Install Dependencies:** Ensure you have installed all project dependencies:
    ```bash
    pnpm install
    ```
2.  **Install Playwright Browsers:** Install the necessary browser binaries for Playwright:
    ```bash
    pnpm exec playwright install
    ```
3.  **Environment Variables:** Some tests might require specific environment variables (e.g., API keys, database connections). Ensure your `.env.local` file is configured correctly. The tests require the backend relay service to be running, usually configured via `AI_RELAY_SERVICE_URL`.
4.  **Backend Service:** The E2E tests depend on the backend relay service (`ai-relay-service`). Ensure it is running, typically via Docker Compose:
    ```bash
    docker-compose up -d ai-relay-service postgres # Or the relevant services
    ```

## Running Tests

The Playwright configuration (`playwright.config.ts`) is set up to automatically start the Next.js development server (`pnpm dev`) before running tests.

### Running All Tests

To run all configured Playwright tests (including E2E and routes):

```bash
pnpm exec playwright test
```

### Running Specific Test Suites (Projects)

You can run specific test suites defined as projects in `playwright.config.ts`:

*   **E2E Tests:** Tests focused on user interface interactions (chat, artifacts, etc.).
    ```bash
    pnpm exec playwright test --project=e2e
    ```
*   **Route Tests:** Tests focused on API route functionality.
    ```bash
    pnpm exec playwright test --project=routes
    ```

### Running Specific Test Files

You can target specific test files by providing their path:

```bash
# Example: Run only chat E2E tests
pnpm exec playwright test tests/e2e/chat.test.ts

# Example: Run only session E2E tests
pnpm exec playwright test tests/e2e/session.test.ts
```

### Running Tests with UI Mode

Playwright offers a UI mode for debugging tests:

```bash
pnpm exec playwright test --ui
```

### Viewing Test Reports

After running tests, an HTML report is generated in the `playwright-report` directory. You can view it using:

```bash
pnpm exec playwright show-report
```

## Test Structure

-   **`tests/e2e/`**: Contains end-to-end tests simulating user interactions with the application.
    -   `chat.test.ts`: Tests core chat functionality.
    -   `artifacts.test.ts`: Tests artifact creation and interaction.
    -   `reasoning.test.ts`: Tests related to AI reasoning steps displayed in the UI.
    -   `session.test.ts`: Tests related to user sessions, login, and chat history.
-   **`tests/routes/`**: Contains tests that likely directly interact with API routes (structure not fully explored).
-   **`tests/fixtures.ts`**: Contains Playwright test fixtures for setting up test contexts.
-   **`tests/helpers.ts`**: Contains helper functions used across different tests.

Other directories within `tests/` (`ai/`, `pages/`, `prompts/`) might contain unit or integration tests specific to those modules, potentially using a different test runner like Jest or Vitest if configured elsewhere, or they might be support files for the Playwright tests.

## Adding or Modifying Test Cases

When adding new tests or modifying existing ones, please follow these general guidelines:

1.  **File Location:** Place new E2E tests in the relevant file within `tests/e2e/` (e.g., chat-related tests in `chat.test.ts`, artifact tests in `artifacts.test.ts`). If a new major feature area is added, consider creating a new file (e.g., `tests/e2e/new-feature.test.ts`).
2.  **Test Structure:** Use Playwright's `test()` function. Group related tests using `test.describe()`.
3.  **Naming Conventions:** Use descriptive names for tests (e.g., `test('should create and update a code artifact', async ({ page }) => { ... });`).
4.  **Use Helpers and Fixtures:** Leverage existing helper functions in `tests/helpers.ts` and fixtures defined in `tests/fixtures.ts` for common tasks like logging in, selecting models, sending messages, or interacting with artifacts.
5.  **Locators:** Prefer using robust Playwright locators (e.g., `page.getByRole`, `page.getByTestId`, `page.getByText`) over CSS selectors where possible.
6.  **Assertions:** Use Playwright's `expect` library for assertions (e.g., `await expect(page.locator('...')).toBeVisible();`).
7.  **Independence:** Aim for tests to be independent. Use `test.beforeEach` or fixtures to set up necessary state for each test (like logging in or navigating to a specific chat).

### Examples

**Example 1: Adding a test for a multi-turn chat interaction**

Let's say you want to test a specific sequence where the user asks a question, the AI uses a tool, and the user asks a follow-up question based on the tool result.

*   **File:** `tests/e2e/chat.test.ts`
*   **Approach:**
    *   Use `test.beforeEach` to log in and potentially create a new chat.
    *   Use helper functions to send the first user message.
    *   Wait for the assistant's response, specifically looking for indicators that the tool was called (e.g., a specific text pattern or a UI element related to the tool invocation).
    *   Assert the presence of the tool result (if visually represented) or the expected text.
    *   Use helper functions to send the follow-up user message.
    *   Wait for and assert the final assistant response.

```typescript
// tests/e2e/chat.test.ts
test.describe('Multi-turn with Tool Use', () => {
  test.beforeEach(async ({ page, login }) => {
    await login(); // Assuming a login fixture
    // Optional: Navigate to a new chat or use helpers.createNewChat
  });

  test('should handle follow-up after createDocument tool use', async ({ page }) => {
    await helpers.sendMessage(page, "Write code for Dijkstra"); // Assuming a helper

    // Wait for assistant response indicating tool use
    const assistantMessage = page.locator('.message-assistant').last();
    await expect(assistantMessage.locator('.tool-invocation-result')).toBeVisible({ timeout: 60000 }); // Wait longer for AI + tool
    await expect(assistantMessage).toContainText(/document containing Python code/);

    await helpers.sendMessage(page, "Add comments to the function");

    // Wait for final response
    const finalAssistantMessage = page.locator('.message-assistant').last();
    await expect(finalAssistantMessage.locator('.tool-invocation-result')).toBeVisible({ timeout: 60000 });
    await expect(finalAssistantMessage).toContainText(/updated the code/);
  });
});
```

**Example 2: Modifying an artifact test for editing**

Suppose you need to add a test specifically for *editing* the content of an existing text artifact.

*   **File:** `tests/e2e/artifacts.test.ts`
*   **Approach:**
    *   Combine steps: First, create a text artifact (reuse existing test logic or helpers).
    *   Locate the artifact panel and its editor.
    *   Simulate user input to modify the text within the editor (e.g., `editorLocator.fill('New edited text.')`).
    *   Trigger the save/update action if necessary (this depends on the artifact UI).
    *   Verify that the artifact content is updated either visually or by checking the chat history for an update confirmation message.

```typescript
// tests/e2e/artifacts.test.ts
test('should allow editing a text artifact', async ({ page, login }) => {
  await login();
  await helpers.sendMessage(page, "Create a text document about Playwright");

  // Wait for artifact creation
  const artifactPanel = page.locator('[data-testid="artifact-panel"]');
  await expect(artifactPanel.locator('h2')).toContainText(/Playwright/, { timeout: 60000 });

  // Locate editor and edit
  const editor = artifactPanel.locator('.text-editor-content'); // Adjust selector as needed
  await editor.click();
  await editor.fill('This is the updated text content.');

  // Add step to trigger save/auto-save if necessary
  // ... depends on UI ...

  // Verify update (e.g., checking updated content, or maybe an assistant confirmation)
  await expect(editor).toHaveText('This is the updated text content.');
  // Or: await expect(page.locator('.message-assistant').last()).toContainText(/document updated/);
});
``` 