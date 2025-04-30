# Docker Setup Guide for AI Chatbot

This guide explains how to use Docker to set up the AI Chatbot application with PostgreSQL.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## Environment Setup

1. Create a `.env.local` file in the project root directory with the following contents:

```
# PostgreSQL Database
POSTGRES_URL=postgresql://postgres:postgres@postgres:5432/ai_chatbot

# Auth
AUTH_SECRET=your-auth-secret-here

# AI Provider API Keys (at least one is required)
OPENAI_API_KEY=your-openai-key-here
# GOOGLE_GENERATIVE_AI_API_KEY=your-google-ai-key-here
# XAI_API_KEY=your-xai-key-here

# File Storage (optional)
# BLOB_READ_WRITE_TOKEN=your-vercel-blob-token-here
```

2. Create a `.env` file in the `ai-relay-service` directory if you plan to use the AI relay service:

```
# AI Provider API Keys
OPENAI_API_KEY=your-openai-key-here
# GOOGLE_GENERATIVE_AI_API_KEY=your-google-ai-key-here
# XAI_API_KEY=your-xai-key-here

# Frontend Origin
FRONTEND_ORIGIN=http://localhost:3000

# Log Level
LOG_LEVEL=INFO
```

## Using Docker Compose

The project includes a `docker-compose.yml` file that sets up:
- PostgreSQL database
- pgAdmin (web-based PostgreSQL admin)
- Next.js application
- AI Relay Service (optional)

### Starting Services

To start all services:

```bash
docker-compose up -d
```

To start only the database:

```bash
docker-compose up -d postgres
```

### Accessing Services

- **Next.js App**: http://localhost:3000
- **pgAdmin**: http://localhost:5050
  - Login: admin@example.com
  - Password: admin
- **AI Relay Service**: http://localhost:8000

### Connecting to PostgreSQL via pgAdmin

1. Access pgAdmin at http://localhost:5050 and login
2. Add a new server:
   - Name: AI Chatbot DB
   - Host: postgres
   - Port: 5432
   - Username: postgres
   - Password: postgres
   - Database: ai_chatbot

## Running Database Migrations

Database migrations are automatically run when the Next.js container starts, but you can also run them manually:

```bash
docker-compose exec nextjs pnpm db:migrate
```

## Viewing Logs

To view logs for a specific service:

```bash
# View Next.js logs
docker-compose logs -f nextjs

# View PostgreSQL logs
docker-compose logs -f postgres

# View AI Relay Service logs
docker-compose logs -f ai-relay
```

## Stopping Services

To stop all services:

```bash
docker-compose down
```

To stop all services and remove volumes (will delete database data):

```bash
docker-compose down -v
```

## Development Workflow

For active development, you might prefer to run just the PostgreSQL container and run the Next.js application directly on your host machine:

```bash
# Start only PostgreSQL
docker-compose up -d postgres

# Run Next.js locally
pnpm dev
```

In this case, update your `.env.local` file to point to the containerized PostgreSQL:

```
POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/ai_chatbot
```

## Troubleshooting

### Database Connection Issues

If the Next.js app cannot connect to the database:

1. Ensure the PostgreSQL container is running:
   ```bash
   docker-compose ps
   ```

2. Check the PostgreSQL logs:
   ```bash
   docker-compose logs postgres
   ```

3. Try connecting to the database directly:
   ```bash
   docker-compose exec postgres psql -U postgres -d ai_chatbot
   ```

4. Verify the connection URL in the `.env.local` file:
   ```
   POSTGRES_URL=postgresql://postgres:postgres@postgres:5432/ai_chatbot
   ```

### Rebuilding Containers

If you make changes to the Dockerfile or docker-compose.yml:

```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
``` 