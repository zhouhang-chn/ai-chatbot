import pytest
import pytest_asyncio
import httpx
from typing import AsyncGenerator

# Adjust the import path based on your project structure
# This assumes tests are run from the ai-relay-service directory
from app.main import app 

@pytest_asyncio.fixture(scope="function")
async def client() -> AsyncGenerator[httpx.AsyncClient, None]:
    """Provides an asynchronous test client for the FastAPI app."""
    # Use httpx's ASGITransport for testing ASGI apps like FastAPI
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as test_client:
        print("Test client created")
        yield test_client
    print("Test client closed")
