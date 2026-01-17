"""
Job Queue Service for async image generation.
Uses Redis to store job state and results.
"""

import os
import json
import uuid
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any
from enum import Enum
import redis.asyncio as redis

from .utils.logger import logger


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"


class JobQueueService:
    """Redis-based job queue for async image generation."""
    
    def __init__(self):
        self.redis_url = os.getenv("REDIS_URL", "redis://api-redis-1:6379/0")
        self.job_ttl = int(os.getenv("JOB_TTL_SECONDS", "3600"))  # 1 hour default
        self.redis_client: Optional[redis.Redis] = None
        self._connected = False
    
    async def connect(self):
        """Connect to Redis."""
        if self._connected:
            return
        try:
            self.redis_client = redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            await self.redis_client.ping()
            self._connected = True
            logger.info(f"Connected to Redis at {self.redis_url}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise
    
    async def disconnect(self):
        """Disconnect from Redis."""
        if self.redis_client:
            await self.redis_client.close()
            self._connected = False
            logger.info("Disconnected from Redis")
    
    def _job_key(self, job_id: str) -> str:
        """Generate Redis key for a job."""
        return f"flux2:job:{job_id}"
    
    async def create_job(self, request_data: Dict[str, Any]) -> str:
        """
        Create a new job and store it in Redis.
        Returns the job_id.
        """
        await self.connect()
        
        job_id = str(uuid.uuid4())
        job_data = {
            "job_id": job_id,
            "status": JobStatus.PENDING.value,
            "request": request_data,
            "result": None,
            "error": None,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            "completed_at": None
        }
        
        await self.redis_client.setex(
            self._job_key(job_id),
            self.job_ttl,
            json.dumps(job_data)
        )
        
        logger.info(f"Created job {job_id}")
        return job_id
    
    async def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job data from Redis."""
        await self.connect()
        
        data = await self.redis_client.get(self._job_key(job_id))
        if data:
            return json.loads(data)
        return None
    
    async def update_job_status(
        self,
        job_id: str,
        status: JobStatus,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None
    ):
        """Update job status and optionally set result or error."""
        await self.connect()
        
        job_data = await self.get_job(job_id)
        if not job_data:
            logger.error(f"Job {job_id} not found")
            return
        
        job_data["status"] = status.value
        job_data["updated_at"] = datetime.utcnow().isoformat()
        
        if result is not None:
            job_data["result"] = result
        if error is not None:
            job_data["error"] = error
        if status in (JobStatus.COMPLETE, JobStatus.FAILED):
            job_data["completed_at"] = datetime.utcnow().isoformat()
        
        await self.redis_client.setex(
            self._job_key(job_id),
            self.job_ttl,
            json.dumps(job_data)
        )
        
        logger.info(f"Updated job {job_id} to status {status.value}")


# Global instance
job_queue = JobQueueService()

