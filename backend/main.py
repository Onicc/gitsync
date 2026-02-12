from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import logging

from database import init_db
from api_tasks import router as tasks_router
from api_stats import router as stats_router
from api_credentials import router as credentials_router
from scheduler import TaskScheduler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Global scheduler instance
scheduler = TaskScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    init_db()
    scheduler.start()
    yield
    # Shutdown
    scheduler.stop()

app = FastAPI(
    title="GitSync API",
    description="Git Repository Backup and Synchronization System",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(tasks_router)
app.include_router(stats_router)
app.include_router(credentials_router)

@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "GitSync"}

# Mount static files (frontend) - must be last
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
