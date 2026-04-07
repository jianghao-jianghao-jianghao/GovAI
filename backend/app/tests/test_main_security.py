import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app import main as app_main
from app.core.response import ErrorCode


class MainSecurityRegressionTest(unittest.IsolatedAsyncioTestCase):
    async def test_global_exception_handler_hides_internal_details_when_debug_disabled(self):
        exc = RuntimeError("db password leaked")

        with patch.object(app_main.settings, "APP_DEBUG", False):
            response = await app_main.global_exception_handler(SimpleNamespace(), exc)

        payload = json.loads(response.body)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(payload["code"], ErrorCode.INTERNAL_ERROR)
        self.assertEqual(payload["message"], "服务器内部错误")

    async def test_global_exception_handler_keeps_details_when_debug_enabled(self):
        exc = RuntimeError("debug detail")

        with patch.object(app_main.settings, "APP_DEBUG", True):
            response = await app_main.global_exception_handler(SimpleNamespace(), exc)

        payload = json.loads(response.body)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(payload["message"], "服务器内部错误: debug detail")


if __name__ == "__main__":
    unittest.main()
