"""API exception classes."""

from typing import Any


class APIError(Exception):
    """Base API error class."""

    def __init__(
        self, status_code: int, detail: str, headers: dict[str, Any] | None = None
    ):
        """Initialize API error.

        Args:
            status_code: HTTP status code
            detail: Error detail message
            headers: Optional response headers
        """
        self.status_code = status_code
        self.detail = detail
        self.headers = headers
        super().__init__(detail)


class WorkflowNotFoundError(APIError):
    """Workflow not found error."""

    def __init__(self, workflow_id: str):
        """Initialize workflow not found error.

        Args:
            workflow_id: Workflow identifier
        """
        super().__init__(status_code=404, detail=f"Workflow '{workflow_id}' not found")


class InvalidWorkflowError(APIError):
    """Invalid workflow error."""

    def __init__(self, detail: str):
        """Initialize invalid workflow error.

        Args:
            detail: Error detail
        """
        super().__init__(status_code=400, detail=f"Invalid workflow: {detail}")


class ContainerBuildError(APIError):
    """Container build error."""

    def __init__(self, detail: str):
        """Initialize container build error.

        Args:
            detail: Error detail
        """
        super().__init__(status_code=500, detail=f"Container build failed: {detail}")


class ModelNotFoundError(APIError):
    """Model not found error."""

    def __init__(self, model_name: str):
        """Initialize model not found error.

        Args:
            model_name: Model name
        """
        super().__init__(status_code=404, detail=f"Model '{model_name}' not found")


class RateLimitExceededError(APIError):
    """Rate limit exceeded error."""

    def __init__(self, limit: int, window: str = "minute"):
        """Initialize rate limit error.

        Args:
            limit: Rate limit
            window: Time window
        """
        super().__init__(
            status_code=429,
            detail=f"Rate limit exceeded: {limit} requests per {window}",
            headers={"Retry-After": "60"},
        )
