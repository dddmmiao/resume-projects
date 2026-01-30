"""
统一的中间件
"""

import time
import uuid
from typing import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware

from .exceptions import (
    ValidationException,
    DatabaseException,
)
from .logging_context import set_trace_id
from .response_models import create_error_response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """请求日志中间件"""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 生成请求ID并设置为trace_id
        request_id = str(uuid.uuid4())[:8]  # 使用短ID作为trace_id
        request.state.request_id = request_id
        set_trace_id(request_id)

        # 记录请求开始时间
        start_time = time.time()

        # 记录请求信息
        logger.info(
            f"Request started - {request.method} {request.url.path} "
            f"from {request.client.host if request.client else 'unknown'}"
        )

        try:
            # 处理请求
            response = await call_next(request)

            # 计算处理时间
            process_time = time.time() - start_time

            # 记录响应信息
            logger.info(
                f"Request completed - {request.method} {request.url.path} "
                f"{response.status_code} in {process_time:.3f}s"
            )

            # 添加响应头
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time"] = f"{process_time:.3f}"

            return response

        except Exception as e:
            # 计算处理时间
            process_time = time.time() - start_time

            # 记录错误信息
            logger.error(
                f"Request failed - {request.method} {request.url.path} "
                f"{str(e)} in {process_time:.3f}s"
            )

            # 返回统一错误响应
            return JSONResponse(
                status_code=500,
                content=create_error_response(
                    message="内部服务器错误", error_code="INTERNAL_SERVER_ERROR"
                ),
                headers={
                    "X-Request-ID": request_id,
                    "X-Process-Time": f"{process_time:.3f}",
                },
            )


class ExceptionHandlerMiddleware(BaseHTTPMiddleware):
    """统一异常处理中间件"""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        try:
            return await call_next(request)
        except ValidationException as e:
            logger.warning(f"Validation error: {str(e)}")
            return JSONResponse(
                status_code=400,
                content=create_error_response(
                    message=str(e), error_code="VALIDATION_ERROR"
                ),
            )
        except DatabaseException as e:
            logger.error(f"Database error: {str(e)}")
            return JSONResponse(
                status_code=500,
                content=create_error_response(
                    message="数据库操作失败", error_code="DATABASE_ERROR"
                ),
            )
        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}")
            return JSONResponse(
                status_code=500,
                content=create_error_response(
                    message="内部服务器错误", error_code="INTERNAL_SERVER_ERROR"
                ),
            )


class CORSMiddleware(BaseHTTPMiddleware):
    """自定义CORS中间件"""

    def __init__(self, app, allow_origins=None, allow_methods=None, allow_headers=None):
        super().__init__(app)
        self.allow_origins = allow_origins or ["*"]
        self.allow_methods = allow_methods or [
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "OPTIONS",
        ]
        self.allow_headers = allow_headers or ["*"]

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 处理预检请求
        if request.method == "OPTIONS":
            response = Response()
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = ", ".join(
                self.allow_methods
            )
            response.headers["Access-Control-Allow-Headers"] = ", ".join(
                self.allow_headers
            )
            response.headers["Access-Control-Max-Age"] = "86400"
            return response

        # 处理正常请求
        response = await call_next(request)

        # 添加CORS头
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        # 暴露自定义响应头（如限流剩余秒数）
        response.headers["Access-Control-Expose-Headers"] = "X-Retry-After"

        return response


class SecurityMiddleware(BaseHTTPMiddleware):
    """安全中间件"""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 检查请求大小
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > 10 * 1024 * 1024:  # 10MB
            return JSONResponse(
                status_code=413,
                content=create_error_response(
                    message="请求体过大", error_code="REQUEST_TOO_LARGE"
                ),
            )

        # 处理请求
        response = await call_next(request)

        # 添加安全头
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        return response


def setup_middleware(app):
    """设置所有中间件"""
    # 导入JWT认证中间件
    from .auth_middleware import JWTAuthMiddleware
    
    # 按顺序添加中间件（后添加的先执行）
    app.add_middleware(SecurityMiddleware)
    app.add_middleware(ExceptionHandlerMiddleware)
    app.add_middleware(JWTAuthMiddleware)  # JWT认证中间件
    app.add_middleware(RequestLoggingMiddleware)

    logger.info("所有中间件已设置完成（包括JWT认证）")
