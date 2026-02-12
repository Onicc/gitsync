from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session
from database import SessionLocal
from models import BackupTask, TaskStatus, TaskLog
from git_engine import GitSyncEngine
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class TaskScheduler:
    """Background task scheduler using APScheduler"""

    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.git_engine = GitSyncEngine()

    def start(self):
        """Start the scheduler"""
        self.scheduler.start()
        logger.info("Task scheduler started")
        self.load_tasks()

    def stop(self):
        """Stop the scheduler"""
        self.scheduler.shutdown()
        logger.info("Task scheduler stopped")

    def load_tasks(self):
        """Load all enabled tasks from database"""
        db = SessionLocal()
        try:
            tasks = db.query(BackupTask).filter(
                BackupTask.enabled == True
            ).all()

            for task in tasks:
                self.schedule_task(task)
                logger.info(f"Scheduled task: {task.name}")
        finally:
            db.close()

    def schedule_task(self, task: BackupTask):
        """Schedule a single task"""
        job_id = f"task_{task.id}"

        # Remove existing job if any
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)

        # Add new job with cron trigger
        try:
            trigger = CronTrigger.from_crontab(task.cron_expression)
            self.scheduler.add_job(
                self.execute_task,
                trigger=trigger,
                id=job_id,
                args=[task.id],
                replace_existing=True
            )
        except Exception as e:
            logger.error(f"Failed to schedule task {task.name}: {e}")

    def execute_task(self, task_id: int):
        """Execute a backup task"""
        db = SessionLocal()
        try:
            task = db.query(BackupTask).filter(BackupTask.id == task_id).first()
            if not task or not task.enabled:
                return

            # Update task status to running
            task.status = TaskStatus.RUNNING
            task.last_run = datetime.now()
            task.current_retry = 0
            db.commit()

            # Create log entry
            log = TaskLog(
                task_id=task.id,
                status=TaskStatus.RUNNING,
                message=f"Starting sync: {task.source_url} → {task.dest_url}",
                started_at=datetime.now()
            )
            db.add(log)
            db.commit()

            # Execute sync with automatic credential lookup
            success, message = self.git_engine.sync_repository(
                source_url=task.source_url,
                dest_url=task.dest_url,
                task_name=task.name,
                db=db
            )

            # Update task status
            if success:
                task.status = TaskStatus.SUCCESS
                task.last_success = datetime.now()
                log.status = TaskStatus.SUCCESS
                log.message = message
            else:
                task.status = TaskStatus.FAILED
                log.status = TaskStatus.FAILED
                log.message = "Sync failed"
                log.error_output = message

            log.completed_at = datetime.now()
            db.commit()

            logger.info(f"Task {task.name} completed: {success}")

        except Exception as e:
            logger.error(f"Task execution error: {e}")
            if task:
                task.status = TaskStatus.FAILED
                db.commit()
        finally:
            db.close()

    def trigger_manual_sync(self, task_id: int):
        """Manually trigger a task sync"""
        self.execute_task(task_id)
