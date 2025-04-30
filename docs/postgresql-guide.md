# PostgreSQL Quick Guide

## Table of Contents
- [Setting Up PostgreSQL with Docker](#setting-up-postgresql-with-docker)
- [Connecting to PostgreSQL](#connecting-to-postgresql)
- [Basic PostgreSQL Commands](#basic-postgresql-commands)
- [Database Operations](#database-operations)
- [Table Operations](#table-operations)
- [Data Manipulation](#data-manipulation)
- [Common Data Types](#common-data-types)
- [Backup and Restore](#backup-and-restore)
- [Useful PostgreSQL Extensions](#useful-postgresql-extensions)
- [Permission Management](#permission-management)
- [Best Practices](#best-practices)

## Setting Up PostgreSQL with Docker

### Simple Setup with Docker

```bash
# Pull the official PostgreSQL image
docker pull postgres:latest

# Run PostgreSQL container
docker run --name postgres-db -e POSTGRES_PASSWORD=mysecretpassword -p 5432:5432 -d postgres:latest
```

### Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:latest
    container_name: postgres-db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: mysecretpassword
      POSTGRES_DB: mydatabase
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres-data:
```

Start the container:

```bash
docker-compose up -d
```

### Docker Container Management

```bash
# Check running containers
docker ps

# Stop the PostgreSQL container
docker stop postgres-db

# Start the PostgreSQL container
docker start postgres-db

# Check container logs
docker logs postgres-db
```

## Connecting to PostgreSQL

### Using psql in Docker container

```bash
# Connect to postgres container
docker exec -it postgres-db psql -U postgres

# Connect to a specific database
docker exec -it postgres-db psql -U postgres -d mydatabase
```

### Using psql from host machine

```bash
psql -h localhost -p 5432 -U postgres -d postgres
```

### Connection string format

```
postgresql://username:password@host:port/database
```

## Basic PostgreSQL Commands

```sql
-- List all databases
\l

-- Connect to a database
\c database_name

-- List all tables
\dt

-- Describe a table
\d table_name

-- List users
\du

-- Show help
\?

-- Quit psql
\q
```

## Database Operations

```sql
-- Create a new database
CREATE DATABASE mydatabase;

-- Drop a database
DROP DATABASE mydatabase;

-- List all databases
SELECT datname FROM pg_database;
```

## Table Operations

```sql
-- Create a table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alter a table (add column)
ALTER TABLE users ADD COLUMN last_login TIMESTAMP;

-- Alter a table (modify column)
ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(100);

-- Alter a table (drop column)
ALTER TABLE users DROP COLUMN last_login;

-- Drop a table
DROP TABLE users;

-- Create an index
CREATE INDEX idx_users_email ON users(email);
```

## Data Manipulation

```sql
-- Insert data
INSERT INTO users (username, email) VALUES ('john_doe', 'john@example.com');

-- Insert multiple rows
INSERT INTO users (username, email) 
VALUES 
    ('alice', 'alice@example.com'),
    ('bob', 'bob@example.com');

-- Select data
SELECT * FROM users;
SELECT username, email FROM users WHERE id = 1;

-- Update data
UPDATE users SET email = 'new_email@example.com' WHERE username = 'john_doe';

-- Delete data
DELETE FROM users WHERE id = 1;

-- Transaction
BEGIN;
INSERT INTO users (username, email) VALUES ('transaction_test', 'test@example.com');
COMMIT;
-- Or ROLLBACK; to undo changes
```

## Common Data Types

- **Numeric Types**: `INTEGER`, `BIGINT`, `NUMERIC`, `REAL`, `SERIAL`
- **Character Types**: `CHAR(n)`, `VARCHAR(n)`, `TEXT`
- **Date/Time Types**: `DATE`, `TIME`, `TIMESTAMP`, `INTERVAL`
- **Boolean**: `BOOLEAN`
- **Binary Data**: `BYTEA`
- **JSON Types**: `JSON`, `JSONB`
- **Arrays**: Any data type with `[]` (e.g., `INTEGER[]`)
- **UUID**: `UUID`
- **Geometric Types**: `POINT`, `LINE`, `POLYGON`

## Backup and Restore

### Backup database

```bash
# Using pg_dump from container
docker exec -t postgres-db pg_dump -U postgres -d mydatabase > backup.sql

# Backup specific tables
docker exec -t postgres-db pg_dump -U postgres -d mydatabase -t users -t orders > tables_backup.sql

# Compressed backup
docker exec -t postgres-db pg_dump -U postgres -d mydatabase | gzip > backup.gz
```

### Restore database

```bash
# Restore from backup
cat backup.sql | docker exec -i postgres-db psql -U postgres -d mydatabase

# Restore compressed backup
gunzip -c backup.gz | docker exec -i postgres-db psql -U postgres -d mydatabase
```

## Useful PostgreSQL Extensions

```sql
-- List available extensions
SELECT * FROM pg_available_extensions;

-- Install an extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Use extension functions
SELECT uuid_generate_v4();

-- Common useful extensions
CREATE EXTENSION IF NOT EXISTS "postgis";       -- Spatial and geographic objects
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- Query performance statistics
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- Cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- Trigram text similarity
```

## Permission Management

### User and Role Management

```sql
-- Create a new user
CREATE USER app_user WITH PASSWORD 'secure_password';

-- Create a role (can be assigned to multiple users)
CREATE ROLE read_only;

-- Grant role to user
GRANT read_only TO app_user;

-- Create user with role attributes
CREATE USER admin_user WITH PASSWORD 'admin_pass' CREATEDB CREATEROLE;

-- Alter user properties
ALTER USER app_user WITH PASSWORD 'new_password';

-- Remove user
DROP USER app_user;

-- List all roles/users
\du
```

### Privileges and Permissions

```sql
-- Grant privileges on database
GRANT CONNECT ON DATABASE mydatabase TO app_user;

-- Grant schema permissions
GRANT USAGE ON SCHEMA public TO app_user;

-- Grant table permissions (SELECT only - read-only access)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO read_only;

-- Grant specific permissions on a table
GRANT SELECT, INSERT, UPDATE ON users TO app_user;

-- Grant all permissions on a table
GRANT ALL PRIVILEGES ON users TO admin_user;

-- Revoke permissions
REVOKE INSERT, UPDATE ON users FROM app_user;

-- Apply default permissions for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT SELECT ON TABLES TO read_only;
```

### Schema-Based Security

```sql
-- Create a new schema
CREATE SCHEMA app_data;

-- Grant permissions on schema
GRANT USAGE ON SCHEMA app_data TO app_user;
GRANT CREATE ON SCHEMA app_data TO admin_user;

-- Set search path (defines schema precedence)
SET search_path TO app_data, public;

-- Create table in schema
CREATE TABLE app_data.sensitive_data (
    id SERIAL PRIMARY KEY,
    data TEXT
);
```

### Row-Level Security (RLS)

```sql
-- Enable row level security on a table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy for access control
CREATE POLICY user_isolation ON users 
    USING (user_id = current_user_id());

-- Policy allowing only read access
CREATE POLICY read_all ON users
    FOR SELECT
    USING (true);

-- Policy restricting updates to own records
CREATE POLICY update_own ON users
    FOR UPDATE
    USING (user_id = current_user_id());

-- Bypass RLS for specific role
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER ROLE admin BYPASSRLS;
```

### Column-Level Permissions

```sql
-- Grant access to specific columns only
GRANT SELECT (username, email) ON users TO app_user;
GRANT SELECT, UPDATE (email) ON users TO app_user;
```

### Connection and Authentication Configuration

Edit the `pg_hba.conf` file to control authentication methods:

```
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             postgres                                trust
host    all             all             127.0.0.1/32            md5
host    sales           salesapp        192.168.0.0/24          scram-sha-256
```

Authentication methods include:
- `trust`: No password required
- `md5`: MD5 password encryption
- `scram-sha-256`: SCRAM-SHA-256 password encryption
- `peer`: Uses OS username
- `ident`: Uses ident server
- `reject`: Reject connections

## Best Practices

1. **Always use prepared statements** to prevent SQL injection
2. **Index frequently queried columns** for performance
3. **Use connection pooling** for application connections
4. **Regularly VACUUM** to reclaim storage and update statistics
5. **Implement proper transaction handling** for data integrity
6. **Set up replication** for high availability
7. **Regularly backup your database**
8. **Monitor query performance** with `EXPLAIN ANALYZE`
