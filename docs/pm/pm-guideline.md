# Project Management Workflow Guidelines

**Date:** 2025-04-30

## 1. Purpose

This document outlines the lightweight project management workflow used for this project. The goal is to provide structure for developing features and addressing issues while remaining flexible. It relies on markdown files within the `docs/PM/` directory.

## 2. Core Components

*   **Ideas (`docs/PM/ideas/`):** High-level concepts for features, improvements, or significant refactors. Should be brief and capture the core value proposition.
*   **Designs (`docs/PM/designs/`):** Detailed technical proposals for implementing an Idea or addressing a complex issue. Outlines the approach, affected components, potential impacts, and open questions. Multiple designs might stem from one idea.
*   **Tasks (`docs/PM/tasks/`):** Actionable work items derived from an approved Design. Breaks down the design into smaller, implementable steps (subtasks). Includes complexity, effort estimates, risks, and testing strategy.
*   **Progress Tracker (`docs/PM/progress.md`):** A central dashboard providing a high-level overview of the status of Ideas, Designs, and Tasks.

## 3. Workflow

1.  **Idea Generation:**
    *   Create a new file in `docs/PM/ideas/` (e.g., `X.Brief-Description.md`).
    *   Briefly describe the concept and rationale.
    *   Update `docs/PM/progress.md` under the "Ideas" section, marking the status as "Proposed".

2.  **Design Phase:**
    *   If an Idea requires significant architectural changes or complex implementation, create one or more Design documents.
    *   Create a new file in `docs/PM/designs/` (e.g., `X.Y.Design-Description.md`, where X matches the Idea number).
    *   Detail the proposed technical solution, background, impact, success metrics, alternatives, and open questions.
    *   Update `docs/PM/progress.md` under the "Designs" section. Link the design to the parent Idea. Mark status as "Draft".
    *   Discuss/review the design. Once agreed upon, update the status in `progress.md` to "Draft Complete" or "Approved". If a design is rejected or superseded, mark it as "Rejected" or "Superseded" and potentially delete the file (note this in `progress.md`).

3.  **Task Breakdown:**
    *   Once a Design is approved/stable enough to start work, break it down into actionable Tasks.
    *   Create a new file in `docs/PM/tasks/` (e.g., `TX.Y.Z-Task-Description.md`, where X.Y matches the Design number).
    *   Define the rationale, overall complexity/effort, and break down the work into specific, testable subtasks.
    *   For each subtask, estimate complexity/LoC, outline risks, and define the testing approach (manual checklist or specific automated tests). Emphasize keeping the project workable after each subtask.
    *   Update `docs/PM/progress.md` under the "Tasks" section. Link the task to the parent Design. Mark the overall task status as "To Do". Use a table to list subtasks and their individual statuses ("To Do", "In Progress", "Done").

4.  **Implementation & Updates:**
    *   Work on Tasks sequentially, focusing on one subtask at a time.
    *   **Before starting code changes for a subtask:** Ensure any necessary tests are ready. For functional changes, this might involve writing new unit/integration tests. For non-functional changes (like documentation), ensure the relevant regression test suite (e.g., Playwright E2E tests) is runnable.
    *   **During implementation:** Keep changes focused on the current subtask.
    *   **After completing a subtask:**
        *   **Run relevant automated tests** (e.g., `npm run test:e2e` for Playwright) to ensure core functionality remains intact. Address any test failures.
        *   **Perform quick manual checks** specific to the subtask goal (e.g., for documentation tasks, verify comments appear in the IDE; for UI tweaks, visually inspect the change).
        *   Commit the changes related *only* to that subtask.
        *   Update the status of the completed subtask in `docs/PM/progress.md` to "**Done**".
    *   **Periodically:** Update the main Task status in `progress.md` (e.g., to "In Progress" when the first subtask starts, "Done" when all subtasks are complete).

5.  **Review & Merging:** Follow standard code review and merging practices. Ensure related PM documents are linked in PRs/commits where applicable.

## 4. Updating Documents

*   **`progress.md`:** Update this file *frequently* as Ideas, Designs, and Tasks change status. This is the primary source for a quick overview.
*   **Task Files:** Update subtask descriptions or add new ones if the scope changes during implementation. Keep risk/complexity estimates updated if necessary.
*   **Design Files:** Generally, designs should be relatively stable before task breakdown. Minor clarifications can be added, but significant changes might warrant a design revision (and potentially new tasks).
*   **Idea Files:** Usually static after creation unless the core concept evolves significantly.

## 5. Naming Conventions

*   **Ideas:** `X.Brief-Description.md` (e.g., `1.Simplify-Frontend.md`)
*   **Designs:** `X.Y.Design-Description.md` (e.g., `1.1.Reduce-Complexity.md`)
*   **Tasks:** `TX.Y.Z-Task-Description.md` (e.g., `T1.1.1-Add-JSDocs.md`)

This provides a clear process for managing development work within the project. 