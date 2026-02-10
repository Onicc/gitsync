from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from database import get_db
from models import BackupTask, TaskStatus, TaskLog
from pydantic import BaseModel

router = APIRouter(prefix="/api/stats", tags=["statistics"])

class DashboardStats(BaseModel):
    total_tasks: int
    successful: int
    running: int
    failed: int
    scheduled: int

@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get dashboard statistics"""
    total = db.query(BackupTask).count()
    successful = db.query(BackupTask).filter(
        BackupTask.status == TaskStatus.SUCCESS
    ).count()
    running = db.query(BackupTask).filter(
        BackupTask.status == TaskStatus.RUNNING
    ).count()
    failed = db.query(BackupTask).filter(
        BackupTask.status == TaskStatus.FAILED
    ).count()
    scheduled = db.query(BackupTask).filter(
        BackupTask.status == TaskStatus.PENDING,
        BackupTask.enabled == True
    ).count()

    return DashboardStats(
        total_tasks=total,
        successful=successful,
        running=running,
        failed=failed,
        scheduled=scheduled
    )

class LogEntry(BaseModel):
    id: int
    task_id: int
    status: str
    message: str
    started_at: str

    class Config:
        from_attributes = True

@router.get("/logs", response_model=List[LogEntry])
def get_recent_logs(limit: int = 20, db: Session = Depends(get_db)):
    """Get recent activity logs"""
    logs = db.query(TaskLog).order_by(
        TaskLog.started_at.desc()
    ).limit(limit).all()
    return logs
