# Developer Guide: ai-chatbot

Welcome to the `ai-chatbot` project! This guide is intended for developers contributing to the project, including those who might be newer to some parts of the tech stack.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

*   **Node.js**: We recommend using the latest LTS version or checking the `.nvmrc` file if present. Download from [nodejs.org](https://nodejs.org/).
*   **pnpm**: This project uses `pnpm` (version specified in `package.json`). Install globally after Node.js:
    ```bash
    npm install -g pnpm
    ```
*   **Git**: For version control. Download from [git-scm.com](https://git-scm.com/).
*   **Docker (Recommended)**: For running a local PostgreSQL database easily, matching the deployment environment.

## Getting Started

1.  **Clone the Repository**:
    ```bash
    git clone <repository-url> # Replace with the actual repo URL
    cd ai-chatbot
    ```

2.  **Install Dependencies**:
    Use `pnpm` to install project dependencies:
    ```bash
    pnpm install
    ```

3.  **Environment Variables**:
    Copy the example environment file (if one exists, e.g., `.env.example`) to `.env.local`:
    ```bash
    cp .env.example .env.local # Or create .env.local manually
    ```
    Edit `.env.local` and provide the necessary values, especially `POSTGRES_URL`.

    **Required AI Provider Keys:**
    You need to provide API keys for at least one AI provider for the application to function. Add the following to your `.env.local` for the providers you want to enable:

    ```dotenv
    # For xAI (Grok)
    XAI_API_KEY=your_xai_api_key

    # For OpenAI (GPT models)
    OPENAI_API_KEY=your_openai_api_key

    # For Google (Gemini models)
    GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key

    # For DeepSeek (if eventually configured via OpenAI-compatible API)
    # DEEPSEEK_API_KEY=your_deepseek_api_key
    # DEEPSEEK_API_BASE=https://api.deepseek.com/v1 # Or their specific base URL
    ```

    **Proxy Configuration (Optional):**
    If you need to route the outgoing API requests to the AI providers through an HTTP/HTTPS proxy, you can configure this using standard Node.js environment variables. Add these to your `.env.local` (for development) or your deployment environment:

    ```dotenv
    # Example Proxy Settings
    HTTPS_PROXY=http://your_proxy_address:port # For HTTPS requests (most common)
    HTTP_PROXY=http://your_proxy_address:port  # For HTTP requests (less common for AI APIs)
    NO_PROXY=localhost,127.0.0.1             # Domains to bypass proxy
    ```
    Replace `http://your_proxy_address:port` with your actual proxy URL. Include username/password if needed (e.g., `http://user:pass@host:port`). Remember to restart your development server after changing `.env.local`.

    *Note: `.env.local` is gitignored and should not be committed.*

4.  **Database Setup**:
    *   Ensure you have a PostgreSQL database running (Docker is recommended).
    *   Make sure the `POSTGRES_URL` in `.env.local` points to it.
    *   Apply the latest database migrations:
        ```bash
        pnpm db:migrate
        ```
    *   To generate new migrations after changing the schema (`lib/db/schema.ts`):
        ```bash
        pnpm db:generate
        ```
        Review the generated SQL in `lib/db/migrations` before running `pnpm db:migrate` again.
    *   You can use Drizzle Studio to inspect the database:
        ```bash
        pnpm db:studio
        ```

## Database Migrations (Drizzle)

This project uses Drizzle ORM and Drizzle Kit to manage database schema changes through migration files stored in `lib/db/migrations`.

Here's the typical workflow for making schema changes:

1.  **Modify the Schema Definition**:
    Make your desired changes (e.g., add tables, columns, indexes) in the schema file: `lib/db/schema.ts`.

2.  **Generate Migration Files**:
    After saving changes to `schema.ts`, generate the corresponding SQL migration file:
    ```bash
    pnpm db:generate
    ```
    This command compares `schema.ts` with the last applied migration and creates a new `.sql` file in `lib/db/migrations` containing the necessary SQL statements (e.g., `ALTER TABLE`, `CREATE TABLE`).

3.  **Review the Generated SQL**:
    Open the newly generated `.sql` file in `lib/db/migrations`. Carefully review the SQL commands to ensure they accurately reflect your intended changes and won't cause unintended data loss.

4.  **Apply Migrations to the Database**:
    Run the migration script to apply any pending migration files (including the one you just generated) to the database configured in `.env.local`:
    ```bash
    pnpm db:migrate
    ```
    This executes the `lib/db/migrate.ts` script, which applies migrations sequentially.

5.  **Commit Changes**:
    Commit **both** your changes to `lib/db/schema.ts` **and** the newly generated migration file(s) in `lib/db/migrations` to your Git repository. This ensures consistency across different environments and for other developers.

*   **Inspecting the Database**: You can use Drizzle Studio to visually inspect your database schema and data at any time:
    ```bash
    pnpm db:studio
    ```

## Development Workflow

*   **Running the Development Server**:
    Starts Next.js in development mode with Fast Refresh (hot-reloading) enabled via Turbopack.
    ```bash
    pnpm dev
    ```
    The application will typically be available at `http://localhost:3000`.

*   **Linting and Formatting**:
    The project uses ESLint and Biome for code quality and formatting. Run them using:
    ```bash
    pnpm lint   # Check linting rules (and auto-fix some with Biome)
    pnpm format # Format code with Biome
    ```
    Consider configuring your editor to use Biome for formatting on save.

*   **Running Tests**:
    Execute the Playwright end-to-end tests:
    ```bash
    pnpm test
    ```
    Ensure the `PLAYWRIGHT=True` environment variable is set if running manually outside the script.

*   **Building for Production**:
    This command first runs database migrations (`tsx lib/db/migrate`) and then creates an optimized production build.
    ```bash
    pnpm build
    ```

*   **Running Production Build Locally**:
    To test the production build locally:
    ```bash
    pnpm start
    ```

## Project Structure Overview

*   `app/`: Next.js App Router directory. Contains pages, layouts, API routes, and route handlers.
*   `components/`: Reusable React components, likely following Shadcn/ui patterns.
    *   `ui/`: Base UI components (often from Shadcn/ui).
    *   `shared/` or similar: Project-specific composite components.
*   `lib/`: Core logic, utilities, and configurations.
    *   `db/`: Drizzle ORM setup, schema (`schema.ts`), migrations, and migration script (`migrate.ts`).
    *   `auth/`: Authentication configuration (NextAuth.js).
    *   `ai/`: Logic related to AI SDK integration.
    *   `utils/`: General helper functions.
*   `hooks/`: Custom React hooks.
*   `public/`: Static assets (images, fonts).
*   `tests/`: Playwright end-to-end tests.
*   `docs/`: Project documentation.
*   `.env.local`: Local environment variables (Gitignored).
*   `package.json`: Project metadata, dependencies, and scripts.
*   `pnpm-lock.yaml`: Exact dependency versions.
*   `next.config.ts`: Next.js configuration.
*   `tailwind.config.ts`: Tailwind CSS configuration.
*   `tsconfig.json`: TypeScript configuration.
*   `drizzle.config.ts`: Drizzle Kit configuration for migrations.
*   `biome.jsonc`: Biome linter/formatter configuration.
*   `playwright.config.ts`: Playwright test runner configuration.

## Key Technologies

*   **Next.js (App Router)**: React framework for routing, server components, API routes, etc.
*   **React**: UI library for building components.
*   **TypeScript**: Static typing for JavaScript.
*   **Tailwind CSS**: Utility-first CSS framework.
*   **Shadcn/ui**: Reusable UI components built with Radix UI and Tailwind CSS.
*   **pnpm**: Package manager.
*   **Drizzle ORM**: TypeScript ORM for interacting with the PostgreSQL database.
*   **PostgreSQL**: Relational database.
*   **NextAuth.js**: Authentication library.
*   **Vercel AI SDK**: For integrating AI features (chat, text generation).
*   **Biome**: Fast formatter and linter.
*   **Playwright**: End-to-end testing framework.
*   **SWR**: React Hooks library for data fetching.
*   **Zod**: Schema declaration and validation library.

## Further Learning

*   [Next.js Documentation](https://nextjs.org/docs)
*   [React Documentation](https://react.dev/)
*   [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
*   [Tailwind CSS Documentation](https://tailwindcss.com/docs)
*   [Shadcn/ui](https://ui.shadcn.com/)
*   [Drizzle ORM Documentation](https://orm.drizzle.team/docs)
*   [NextAuth.js Documentation](https://authjs.dev/)
*   [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
*   [Biome Documentation](https://biomejs.dev/)
*   [Playwright Documentation](https://playwright.dev/docs/intro)

Happy coding! 