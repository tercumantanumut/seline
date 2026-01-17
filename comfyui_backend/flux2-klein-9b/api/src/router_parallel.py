import time
import os
import hashlib
from fastapi import APIRouter, Header, HTTPException, status, Depends, BackgroundTasks
from fastapi.responses import Response
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
from .schema import ProcessRequest, HealthResponse, AsyncJobResponse, JobStatusResponse
from .pipeline import Pipeline
from .job_queue import job_queue, JobStatus
import asyncio
from config import API_KEY

router = APIRouter()

# Concurrency control
MAX_CONCURRENT = int(os.getenv('MAX_CONCURRENT_REQUESTS', '4'))
semaphore = asyncio.Semaphore(MAX_CONCURRENT)

# Database connection settings
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@ai-platform-postgres:5432/ai_platform")

# Prometheus metrics
REQUEST_COUNT = Counter('flux2_requests_total', 'Total requests', ['endpoint', 'status'])
REQUEST_DURATION = Histogram('flux2_request_duration_seconds', 'Request duration')
PREDICTION_COUNT = Counter('flux2_predictions_total', 'Total predictions', ['status'])
CONCURRENT_REQUESTS = Gauge('flux2_concurrent_requests', 'Current concurrent requests')

async def validate_api_key(x_api_key: str = Header(None)):
    """Validate API key against the centralized database"""
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required. Include X-API-Key header."
        )

    # For backward compatibility, check if it's the internal gateway key
    if x_api_key == API_KEY:
        return {"user_id": "internal", "is_admin": True, "tier": "enterprise"}

    # Check against centralized database
    try:
        import asyncpg

        # Hash the API key
        hashed_key = hashlib.sha256(x_api_key.encode()).hexdigest()

        # Connect to database and validate
        conn = await asyncpg.connect(DATABASE_URL)
        try:
            # Query for the API key
            query = """
                SELECT ak.id, ak.user_id, ak.rate_limit, u.username, u.tier, u.is_admin, u.permissions
                FROM api_keys ak
                JOIN users u ON ak.user_id = u.id
                WHERE ak.key_hash = $1 AND ak.is_active = true AND ak.expires_at > NOW()
            """
            result = await conn.fetchrow(query, hashed_key)

            if not result:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired API key"
                )

            # Update usage count
            await conn.execute(
                "UPDATE api_keys SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = $1",
                result['id']
            )

            return {
                "user_id": result['user_id'],
                "username": result['username'],
                "tier": result['tier'],
                "is_admin": result['is_admin'],
                "permissions": result['permissions'] or [],
                "rate_limit": result['rate_limit']
            }

        finally:
            await conn.close()

    except Exception as e:
        # Fallback to internal key validation if database is unavailable
        if x_api_key == API_KEY:
            return {"user_id": "internal", "is_admin": True, "tier": "enterprise"}

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key"
        )

@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    REQUEST_COUNT.labels(endpoint="/health", status="200").inc()
    return HealthResponse(
        status="healthy",
        service="flux2-api",
        timestamp=time.time(),
        max_concurrent_requests=MAX_CONCURRENT,
        active_requests=MAX_CONCURRENT - semaphore._value
    )

@router.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@router.post("/flux2/generate")
async def generate_image(request: ProcessRequest, user: dict = Depends(validate_api_key)):
    """
    Generate an image using Flux2 model.

    Supports text-to-image generation and multi-reference image editing.
    - Without reference_images: Pure text-to-image generation
    - With reference_images (1-10 base64 encoded): Image editing with reference images
    """
    start_time = time.time()

    # Check if we're at capacity
    if semaphore._value == 0:
        REQUEST_COUNT.labels(endpoint="/flux2/generate", status="503").inc()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Service at capacity. Max concurrent requests: {MAX_CONCURRENT}"
        )

    async with semaphore:
        CONCURRENT_REQUESTS.inc()
        try:
            pipeline = Pipeline(request=request)
            result = await pipeline.main()

            # Record successful metrics
            duration = time.time() - start_time
            REQUEST_DURATION.observe(duration)
            REQUEST_COUNT.labels(endpoint="/flux2/generate", status="200").inc()
            PREDICTION_COUNT.labels(status="success").inc()

            return result

        except HTTPException:
            # Re-raise HTTP exceptions (they already have proper status codes)
            duration = time.time() - start_time
            REQUEST_DURATION.observe(duration)
            REQUEST_COUNT.labels(endpoint="/flux2/generate", status="400").inc()
            PREDICTION_COUNT.labels(status="error").inc()
            raise

        except Exception as e:
            # Record error metrics
            duration = time.time() - start_time
            REQUEST_DURATION.observe(duration)
            REQUEST_COUNT.labels(endpoint="/flux2/generate", status="500").inc()
            PREDICTION_COUNT.labels(status="error").inc()
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            CONCURRENT_REQUESTS.dec()


# ============================================================================
# ASYNC ENDPOINTS FOR POLLING PATTERN (Avoids Vercel 60s timeout)
# ============================================================================

async def process_job_in_background(job_id: str, request: ProcessRequest):
    """
    Background task to process image generation.
    Updates job status in Redis as it progresses.
    """
    try:
        # Update status to processing
        await job_queue.update_job_status(job_id, JobStatus.PROCESSING)

        # Process the request (same as sync endpoint)
        async with semaphore:
            CONCURRENT_REQUESTS.inc()
            try:
                start_time = time.time()
                pipeline = Pipeline(request=request)
                result = await pipeline.main()

                duration = time.time() - start_time
                REQUEST_DURATION.observe(duration)
                REQUEST_COUNT.labels(endpoint="/flux2/generate-async", status="200").inc()
                PREDICTION_COUNT.labels(status="success").inc()

                # Update job with result
                await job_queue.update_job_status(
                    job_id,
                    JobStatus.COMPLETE,
                    result={
                        "result": result["result"].decode() if isinstance(result["result"], bytes) else result["result"],
                        "seed": result.get("seed"),
                        "time_taken": result.get("time_taken")
                    }
                )
            finally:
                CONCURRENT_REQUESTS.dec()

    except Exception as e:
        REQUEST_COUNT.labels(endpoint="/flux2/generate-async", status="500").inc()
        PREDICTION_COUNT.labels(status="error").inc()
        await job_queue.update_job_status(
            job_id,
            JobStatus.FAILED,
            error=str(e)
        )


@router.post("/flux2/generate-async", response_model=AsyncJobResponse)
async def generate_image_async(
    request: ProcessRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(validate_api_key)
):
    """
    Queue an image generation job and return immediately with a job_id.

    Use this endpoint to avoid timeout issues with long-running requests.
    Poll /flux2/status/{job_id} to check the job status and get the result.

    Supports text-to-image generation and multi-reference image editing.
    - Without reference_images: Pure text-to-image generation
    - With reference_images (1-10 base64 encoded): Image editing with reference images
    """
    # Create job in Redis
    request_data = request.dict()
    job_id = await job_queue.create_job(request_data)

    # Queue the background task
    background_tasks.add_task(process_job_in_background, job_id, request)

    REQUEST_COUNT.labels(endpoint="/flux2/generate-async", status="202").inc()

    return AsyncJobResponse(
        job_id=job_id,
        status="pending",
        message="Job queued successfully. Poll /flux2/status/{job_id} for results."
    )


@router.get("/flux2/status/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str, user: dict = Depends(validate_api_key)):
    """
    Get the status of an async image generation job.

    Returns:
    - pending: Job is queued but not yet started
    - processing: Job is currently being processed
    - complete: Job finished successfully, result contains the base64 image
    - failed: Job failed, error contains the error message
    """
    job_data = await job_queue.get_job(job_id)

    if not job_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found or expired"
        )

    response = JobStatusResponse(
        job_id=job_data["job_id"],
        status=job_data["status"],
        created_at=job_data.get("created_at"),
        completed_at=job_data.get("completed_at")
    )

    if job_data["status"] == JobStatus.COMPLETE.value and job_data.get("result"):
        response.result = job_data["result"].get("result")
        response.seed = job_data["result"].get("seed")
        response.time_taken = job_data["result"].get("time_taken")

    if job_data["status"] == JobStatus.FAILED.value:
        response.error = job_data.get("error")

    return response
