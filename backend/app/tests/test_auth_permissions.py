import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.api import auth
from app.core import deps
from app.core.response import ErrorCode
from app.core.security import hash_password
from app.models.user import User
from app.schemas.auth import LoginRequest


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _RoutingDB:
    def __init__(self, resolver):
        self._resolver = resolver
        self.flushed = False

    async def execute(self, stmt):
        return self._resolver(stmt)

    async def flush(self):
        self.flushed = True


class _FakeRedis:
    def __init__(self, store=None):
        self._store = dict(store or {})
        self.setex_calls = []

    async def get(self, key):
        return self._store.get(key)

    async def setex(self, key, ttl, value):
        self.setex_calls.append((key, ttl, value))
        self._store[key] = value
        return True


class AuthPermissionRegressionTest(unittest.IsolatedAsyncioTestCase):
    def _make_user(self, *, status="active", password="secret123"):
        return User(
            id=uuid.uuid4(),
            username="tester",
            password_hash=hash_password(password),
            display_name="测试用户",
            department="办公室",
            role_id=uuid.uuid4(),
            status=status,
        )

    async def test_login_returns_token_payload_for_active_user(self):
        user = self._make_user()
        db = _RoutingDB(lambda _stmt: _FakeResult(user))
        request = SimpleNamespace(
            client=SimpleNamespace(host="127.0.0.1"),
            headers={"user-agent": "pytest"},
        )

        with (
            patch.object(auth, "create_access_token", return_value="jwt-token"),
            patch.object(auth, "get_user_permissions", new=AsyncMock(return_value=["app:doc:write"])),
            patch.object(auth, "get_user_role_name", new=AsyncMock(return_value="管理员")),
            patch.object(auth, "log_action", new=AsyncMock()),
        ):
            response = await auth.login(
                body=LoginRequest(username="tester", password="secret123"),
                request=request,
                db=db,
            )

        self.assertEqual(response["code"], 0)
        self.assertEqual(response["data"]["access_token"], "jwt-token")
        self.assertEqual(response["data"]["user"]["permissions"], ["app:doc:write"])
        self.assertEqual(response["data"]["user"]["role_name"], "管理员")
        self.assertIsNotNone(user.last_login_at)
        self.assertTrue(db.flushed)

    async def test_login_rejects_disabled_user(self):
        user = self._make_user(status="disabled")
        db = _RoutingDB(lambda _stmt: _FakeResult(user))

        response = await auth.login(
            body=LoginRequest(username="tester", password="secret123"),
            request=SimpleNamespace(client=None, headers={}),
            db=db,
        )

        self.assertEqual(response["code"], ErrorCode.ACCOUNT_DISABLED)
        self.assertIn("禁用", response["message"])

    async def test_get_current_user_rejects_blacklisted_token(self):
        redis = _FakeRedis({"token_blacklist:bad-token": "1"})

        with patch.object(deps, "get_redis", new=AsyncMock(return_value=redis)):
            with self.assertRaises(deps.AuthError) as ctx:
                await deps.get_current_user(
                    credentials=SimpleNamespace(credentials="bad-token"),
                    db=_RoutingDB(lambda _stmt: _FakeResult(None)),
                )

        self.assertEqual(ctx.exception.code, ErrorCode.TOKEN_INVALID)
        self.assertIn("失效", ctx.exception.message)

    async def test_refresh_token_blacklists_old_token_and_returns_new_one(self):
        user = self._make_user()
        redis = _FakeRedis()
        request = SimpleNamespace(headers={"authorization": "Bearer old-token"})

        with (
            patch.object(auth, "get_redis", new=AsyncMock(return_value=redis)),
            patch.object(auth, "create_access_token", return_value="new-token"),
        ):
            response = await auth.refresh_token(request=request, user=user)

        self.assertEqual(response["code"], 0)
        self.assertEqual(response["data"]["access_token"], "new-token")
        self.assertEqual(len(redis.setex_calls), 1)
        self.assertEqual(redis.setex_calls[0][0], "token_blacklist:old-token")
        self.assertEqual(redis._store["token_blacklist:old-token"], "1")

    async def test_require_permission_rejects_missing_permission(self):
        checker = deps.require_permission("app:doc:write")
        user = self._make_user()
        user.role_id = None

        with patch.object(deps, "get_user_permissions", new=AsyncMock(return_value=[])):
            with self.assertRaises(deps.AuthError) as ctx:
                await checker(
                    user=user,
                    db=_RoutingDB(lambda _stmt: _FakeResult(None)),
                )

        self.assertEqual(ctx.exception.code, ErrorCode.PERMISSION_DENIED)
        self.assertIn("app:doc:write", ctx.exception.message)


if __name__ == "__main__":
    unittest.main()
