from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

# Determine which router to use based on environment variable
USE_PARALLEL_ROUTER = os.getenv("USE_PARALLEL_ROUTER", "true").lower() == "true"

if USE_PARALLEL_ROUTER:
    from src.router_parallel import router
else:
    from src.router import router

app = FastAPI(
    title="Flux2 Image Generation API",
    description="Advanced image generation with Flux2 model supporting text-to-image and multi-reference image editing (0-10 reference images)",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins="*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    router=router,
)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app="app:app", host="0.0.0.0", port=5050, reload=False)
