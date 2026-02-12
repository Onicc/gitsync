from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime
from database import get_db
from models import BackupTask, TaskStatus, TaskLog
from pydantic import BaseModel
from croniter import croniter

router = APIRouter(prefix="/api/stats", tags=["statistics"])

class DashboardStats(BaseModel):
    total_tasks: int
    successful: int
    paused: int
    failed: int
    scheduled: int
    next_execution: Optional[str] = None

@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get dashboard statistics"""
    total = db.query(BackupTask).count()
    successful = db.query(BackupTask).filter(
        BackupTask.status == TaskStatus.SUCCESS
    ).count()
    paused = db.query(BackupTask).filter(
        BackupTask.status == TaskStatus.PAUSED
    ).count()
    failed = db.query(BackupTask).filter(
        BackupTask.status == TaskStatus.FAILED
    ).count()
    scheduled = db.query(BackupTask).filter(
        BackupTask.status == TaskStatus.PENDING,
        BackupTask.enabled == True
    ).count()

    # Calculate next execution time across all enabled tasks
    next_execution = None
    enabled_tasks = db.query(BackupTask).filter(
        BackupTask.enabled == True
    ).all()

    if enabled_tasks:
        next_times = []
        now = datetime.now()

        for task in enabled_tasks:
            try:
                cron = croniter(task.cron_expression, now)
                next_time = cron.get_next(datetime)
                next_times.append(next_time)
            except Exception:
                # Skip invalid cron expressions
                continue

        if next_times:
            earliest = min(next_times)
            next_execution = earliest.strftime("%H:%M")

    return DashboardStats(
        total_tasks=total,
        successful=successful,
        paused=paused,
        failed=failed,
        scheduled=scheduled,
        next_execution=next_execution
    )

class LogEntry(BaseModel):
    id: int
    task_id: int
    status: str
    message: str
    started_at: str

    class Config:
        from_attributes = True

@router.get("/logs")
def get_recent_logs(limit: int = 20, db: Session = Depends(get_db)):
    """Get recent activity logs"""
    logs = db.query(TaskLog).order_by(
        TaskLog.started_at.desc()
    ).limit(limit).all()

    return [{
        "id": log.id,
        "task_id": log.task_id,
        "status": log.status.value,
        "message": log.message,
        "started_at": log.started_at.isoformat()
    } for log in logs]

@router.get("/failed-tasks")
def get_failed_tasks(db: Session = Depends(get_db)):
    """Get failed tasks with error details"""
    failed_logs = db.query(TaskLog).filter(
        TaskLog.status == TaskStatus.FAILED,
        TaskLog.error_output.isnot(None)
    ).order_by(TaskLog.started_at.desc()).limit(10).all()

    result = []
    for log in failed_logs:
        task = db.query(BackupTask).filter(BackupTask.id == log.task_id).first()
        if task:
            result.append({
                "task_id": task.id,
                "task_name": task.name,
                "source_url": task.source_url,
                "dest_url": task.dest_url,
                "error_message": log.message,
                "error_output": log.error_output,
                "failed_at": log.started_at.isoformat()
            })

    return result

@router.delete("/logs")
def clear_all_logs(db: Session = Depends(get_db)):
    """Clear all activity logs"""
    db.query(TaskLog).delete()
    db.commit()
    return {"message": "All logs cleared successfully"}
