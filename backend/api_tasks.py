from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from database import get_db
from models import BackupTask, TaskStatus, PlatformType, TaskLog

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# Pydantic schemas
class TaskCreate(BaseModel):
    name: str
    icon: str = "📦"
    source_platform: str
    source_url: str
    dest_platform: str
    dest_url: str
    cron_expression: str
    retry_count: int = 3

class TaskResponse(BaseModel):
    id: int
    name: str
    icon: str
    source_platform: str
    source_url: str
    dest_platform: str
    dest_url: str
    cron_expression: str
    enabled: bool
    status: str
    last_run: Optional[datetime]
    last_success: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True

@router.get("/", response_model=List[TaskResponse])
def get_tasks(db: Session = Depends(get_db)):
    """Get all backup tasks"""
    tasks = db.query(BackupTask).all()
    return tasks

@router.post("/", response_model=TaskResponse)
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    """Create a new backup task"""
    # Check if task name already exists
    existing = db.query(BackupTask).filter(BackupTask.name == task.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Task name already exists")

    db_task = BackupTask(
        name=task.name,
        icon=task.icon,
        source_platform=PlatformType[task.source_platform.upper()],
        source_url=task.source_url,
        dest_platform=PlatformType[task.dest_platform.upper()],
        dest_url=task.dest_url,
        cron_expression=task.cron_expression,
        retry_count=task.retry_count
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@router.get("/{task_id}", response_model=TaskResponse)
def get_task(task_id: int, db: Session = Depends(get_db)):
    """Get a specific task"""
    task = db.query(BackupTask).filter(BackupTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@router.put("/{task_id}", response_model=TaskResponse)
def update_task(task_id: int, task: TaskCreate, db: Session = Depends(get_db)):
    """Update a task"""
    db_task = db.query(BackupTask).filter(BackupTask.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    db_task.name = task.name
    db_task.icon = task.icon
    db_task.source_platform = PlatformType[task.source_platform.upper()]
    db_task.source_url = task.source_url
    db_task.dest_platform = PlatformType[task.dest_platform.upper()]
    db_task.dest_url = task.dest_url
    db_task.cron_expression = task.cron_expression
    db_task.retry_count = task.retry_count

    db.commit()
    db.refresh(db_task)
    return db_task

@router.delete("/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    """Delete a task"""
    task = db.query(BackupTask).filter(BackupTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    db.delete(task)
    db.commit()
    return {"message": "Task deleted successfully"}

@router.post("/{task_id}/sync")
def trigger_sync(task_id: int, db: Session = Depends(get_db)):
    """Manually trigger a sync for a task"""
    task = db.query(BackupTask).filter(BackupTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # This will be handled by the scheduler
    return {"message": "Sync triggered", "task_id": task_id}

@router.post("/{task_id}/pause")
def pause_task(task_id: int, db: Session = Depends(get_db)):
    """Pause a task"""
    task = db.query(BackupTask).filter(BackupTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.enabled = False
    db.commit()
    return {"message": "Task paused"}

@router.post("/{task_id}/resume")
def resume_task(task_id: int, db: Session = Depends(get_db)):
    """Resume a task"""
    task = db.query(BackupTask).filter(BackupTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.enabled = True
    db.commit()
    return {"message": "Task resumed"}
