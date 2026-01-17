import time
import os
import hashlib
from fastapi import APIRouter, Header, HTTPException, status, Depends
from fastapi.responses import Response
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from .schema import ProcessRequest, HealthResponse
from .pipeline import Pipeline
import asyncio
from config import API_KEY

router = APIRouter()
lock = asyncio.Lock()

# Database connection settings
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@ai-platform-postgres:5432/ai_platform")

# Prometheus metrics
REQUEST_COUNT = Counter('flux2_requests_total', 'Total requests', ['endpoint', 'status'])
REQUEST_DURATION = Histogram('flux2_request_duration_seconds', 'Request duration')
PREDICTION_COUNT = Counter('flux2_predictions_total', 'Total predictions', ['status'])

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
        timestamp=time.time()
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

    try:
        async with lock:
            pipeline = Pipeline(request=request)
            result = await pipeline.main()

            # Record successful metrics
            duration = time.time() - start_time
            REQUEST_DURATION.observe(duration)
            REQUEST_COUNT.labels(endpoint="/flux2/generate", status="200").inc()
            PREDICTION_COUNT.labels(status="success").inc()

            return result

    except HTTPException:
        # Re-raise HTTP exceptions
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
