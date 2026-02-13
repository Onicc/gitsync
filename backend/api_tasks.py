from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from database import get_db
from models import BackupTask, TaskStatus, PlatformType, TaskLog
from git_engine import GitSyncEngine

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# Git sync engine instance
git_engine = GitSyncEngine()

# Scheduler instance (set by main.py)
scheduler = None

def set_scheduler(sched):
    """Set the scheduler instance"""
    global scheduler
    scheduler = sched

# Pydantic schemas
class TaskCreate(BaseModel):
    name: str
    group: str = "Default"
    source_platform: str
    source_url: str
    dest_platform: str
    dest_url: str
    cron_expression: str
    retry_count: int = 3

class TaskResponse(BaseModel):
    id: int
    name: str
    group: str
    source_platform: str
    source_url: str
    dest_platform: str
    dest_url: str
    cron_expression: str
    retry_count: int
    enabled: bool
    status: str
    last_run: Optional[datetime]
    last_success: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True

@router.get("/", response_model=List[TaskResponse])
def get_tasks(db: Session = Depends(get_db)):
    """Get all backup tasks sorted by group"""
    tasks = db.query(BackupTask).order_by(BackupTask.group, BackupTask.name).all()
    return tasks

@router.get("/groups", response_model=List[str])
def get_groups(db: Session = Depends(get_db)):
    """Get all unique task groups"""
    groups = db.query(BackupTask.group).distinct().order_by(BackupTask.group).all()
    return [group[0] for group in groups]

@router.post("/", response_model=TaskResponse)
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    """Create a new backup task"""
    # Check if task name already exists
    existing = db.query(BackupTask).filter(BackupTask.name == task.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Task name already exists")

    db_task = BackupTask(
        name=task.name,
        group=task.group,
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
    db_task.group = task.group
    db_task.source_platform = PlatformType[task.source_platform.upper()]
    db_task.source_url = task.source_url
    db_task.dest_platform = PlatformType[task.dest_platform.upper()]
    db_task.dest_url = task.dest_url
    db_task.cron_expression = task.cron_expression
    db_task.retry_count = task.retry_count

    db.commit()
    db.refresh(db_task)

    # Reschedule task if enabled
    if scheduler and db_task.enabled:
        scheduler.schedule_task(db_task)

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
def trigger_sync(task_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Manually trigger a sync for a task"""
    task = db.query(BackupTask).filter(BackupTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Execute sync in background
    background_tasks.add_task(execute_sync_task, task_id)
    return {"message": "Sync started", "task_id": task_id}

def execute_sync_task(task_id: int):
    """Execute sync task in background"""
    from database import SessionLocal
    db = SessionLocal()
    try:
        task = db.query(BackupTask).filter(BackupTask.id == task_id).first()
        if not task:
            return

        # Update status to running
        task.status = TaskStatus.RUNNING
        task.last_run = datetime.now()
        db.commit()

        # Create log entry
        log = TaskLog(
            task_id=task.id,
            status=TaskStatus.RUNNING,
            message=f"Manual sync: {task.source_url} → {task.dest_url}",
            started_at=datetime.now()
        )
        db.add(log)
        db.commit()

        # Execute sync with automatic credential lookup
        success, message = git_engine.sync_repository(
            source_url=task.source_url,
            dest_url=task.dest_url,
            task_name=task.name,
            db=db
        )

        # Update status
        if success:
            task.status = TaskStatus.SUCCESS
            task.last_success = datetime.now()
            log.status = TaskStatus.SUCCESS
            log.message = message
        else:
            task.status = TaskStatus.FAILED
            log.status = TaskStatus.FAILED
            log.message = f"Sync failed: {task.source_url} → {task.dest_url}"
            log.error_output = message

        log.completed_at = datetime.now()
        db.commit()

    except Exception as e:
        if task:
            task.status = TaskStatus.FAILED
            db.commit()
    finally:
        db.close()

@router.post("/{task_id}/pause")
def pause_task(task_id: int, db: Session = Depends(get_db)):
    """Pause a task"""
    task = db.query(BackupTask).filter(BackupTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.enabled = False
    task.status = TaskStatus.PAUSED
    db.commit()

    # Create log entry
    log = TaskLog(
        task_id=task.id,
        status=TaskStatus.PAUSED,
        message=f"Task paused: {task.source_url} → {task.dest_url}",
        started_at=datetime.now()
    )
    db.add(log)
    db.commit()

    # Remove task from scheduler
    if scheduler:
        scheduler.unschedule_task(task_id)

    return {"message": "Task paused"}

@router.post("/{task_id}/resume")
def resume_task(task_id: int, db: Session = Depends(get_db)):
    """Resume a task"""
    task = db.query(BackupTask).filter(BackupTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.enabled = True
    task.status = TaskStatus.PENDING
    db.commit()

    # Create log entry
    log = TaskLog(
        task_id=task.id,
        status=TaskStatus.PENDING,
        message=f"Task resumed: {task.source_url} → {task.dest_url}",
        started_at=datetime.now()
    )
    db.add(log)
    db.commit()

    # Add task back to scheduler
    if scheduler:
        scheduler.schedule_task(task)

    return {"message": "Task resumed"}
