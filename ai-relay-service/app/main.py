import os
from dotenv import load_dotenv
import logging # Import logging

# Load environment variables FIRST
dotenv_path = os.path.join(os.path.dirname(__file__), '../.env')
load_dotenv(dotenv_path=dotenv_path)

# --- Logging Configuration --- #
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=log_level,
    format='%(asctime)s - %(levelname)s - [%(name)s] [%(filename)s:%(lineno)d] - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__) # Get logger for main.py
# --------------------------- #

# Now other imports
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(
    title="AI Relay Service",
    version="0.1.0",
    description="Relays requests to various AI providers with proxy support."
)

# Configure CORS
# IMPORTANT: Restrict origins in production!
# Allow Next.js frontend origin during development
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin], # Or ["*"] for testing, but restrict later
    allow_credentials=True,
    allow_methods=["*"], # Allows all methods
    allow_headers=["*"] # Allows all headers
)

# Include the API router
from .api import router as api_router
app.include_router(api_router, prefix="/api/v1") # Add a prefix for versioning

@app.get("/health", tags=["Health Check"])
async def health_check():
    """Checks if the service is running."""
    logger.info("Health check requested.") # Use logger
    return {"status": "ok"}

# We will add the main /generate/stream endpoint in api.py later

if __name__ == "__main__":
    # Get port from environment or default to 8001
    port = int(os.getenv("PORT", "8001"))
    logger.info(f"Starting AI Relay Service on http://0.0.0.0:{port}") # Use logger
    # Note: Run with `uvicorn app.main:app --reload --port 8001` for development
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True) # Pass app as string for reload
