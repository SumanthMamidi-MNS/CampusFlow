from typing import Any, Dict, List, Optional
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError


class AppException(Exception):
    def __init__(
        self,
        status_code: int,
        error_code: str,
        message: str,
        details: Optional[List[Any]] = None
    ):
        self.status_code = status_code
        self.error_code = error_code
        self.message = message
        self.details = details or []


class NotFoundError(AppException):
    def __init__(self, message: str = "Resource not found", details: Optional[List[Any]] = None):
        super().__init__(404, "NOT_FOUND", message, details)


class ValidationError(AppException):
    def __init__(self, message: str = "Validation error", details: Optional[List[Any]] = None):
        super().__init__(400, "VALIDATION_ERROR", message, details)


class AuthenticationError(AppException):
    def __init__(self, message: str = "Authentication failed", details: Optional[List[Any]] = None):
        super().__init__(401, "UNAUTHENTICATED", message, details)


class AuthorizationError(AppException):
    def __init__(self, message: str = "Permission denied", details: Optional[List[Any]] = None):
        super().__init__(403, "UNAUTHORIZED", message, details)


class ConflictError(AppException):
    def __init__(self, message: str = "Resource conflict", details: Optional[List[Any]] = None):
        super().__init__(409, "CONFLICT", message, details)


def _format_error_response(request: Request, error_code: str, message: str, details: List[Any]) -> Dict[str, Any]:
    return {
        "error": {
            "code": error_code,
            "message": message,
            "details": details
        },
        "meta": {
            "request_id": getattr(request.state, "request_id", None)
        }
    }


def register_exception_handlers(app: FastAPI):
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        return JSONResponse(
            status_code=exc.status_code,
            content=_format_error_response(request, exc.error_code, exc.message, exc.details)
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content=_format_error_response(request, "UNPROCESSABLE_ENTITY", "Validation Error", exc.errors())
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=500,
            content=_format_error_response(request, "INTERNAL_SERVER_ERROR", "An unexpected error occurred", [])
        )
