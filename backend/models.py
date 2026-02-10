from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Enum
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import enum

Base = declarative_base()

class TaskStatus(enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    PAUSED = "paused"

class PlatformType(enum.Enum):
    GITHUB = "github"
    GITLAB = "gitlab"
    GITEE = "gitee"
    LOCAL = "local"
    CUSTOM = "custom"

class BackupTask(Base):
    __tablename__ = "backup_tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    icon = Column(String(10), default="📦")

    # Source
    source_platform = Column(Enum(PlatformType), nullable=False)
    source_url = Column(String(500), nullable=False)

    # Destination
    dest_platform = Column(Enum(PlatformType), nullable=False)
    dest_url = Column(String(500), nullable=False)

    # Schedule
    cron_expression = Column(String(100), nullable=False)
    enabled = Column(Boolean, default=True)

    # Status
    status = Column(Enum(TaskStatus), default=TaskStatus.PENDING)
    last_run = Column(DateTime, nullable=True)
    last_success = Column(DateTime, nullable=True)
    retry_count = Column(Integer, default=3)
    current_retry = Column(Integer, default=0)

    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class TaskLog(Base):
    __tablename__ = "task_logs"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, nullable=False, index=True)
    status = Column(Enum(TaskStatus), nullable=False)
    message = Column(Text, nullable=False)
    error_output = Column(Text, nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

class Credential(Base):
    __tablename__ = "credentials"

    id = Column(Integer, primary_key=True, index=True)
    platform = Column(Enum(PlatformType), nullable=False)
    credential_type = Column(String(50), nullable=False)  # ssh, token, password
    name = Column(String(255), nullable=False)
    encrypted_value = Column(Text, nullable=False)
    scopes = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
