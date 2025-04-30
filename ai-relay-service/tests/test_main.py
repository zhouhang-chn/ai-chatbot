import pytest
import httpx

pytestmark = pytest.mark.asyncio

async def test_health_check(client: httpx.AsyncClient):
    """Tests the /health endpoint."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
