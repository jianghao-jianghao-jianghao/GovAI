import asyncio
import errno
import unittest
from unittest.mock import AsyncMock, patch

from app import main as app_main


class StartupSingletonTest(unittest.IsolatedAsyncioTestCase):
    async def test_run_singleton_startup_tasks_runs_when_lock_owned(self):
        scheduled = []

        def _fake_schedule(coro, task_name):
            scheduled.append(task_name)
            coro.close()

        with (
            patch.object(app_main, "_ensure_document_status_enum", new=AsyncMock()) as ensure_status,
            patch.object(app_main, "_ensure_graph_tables", new=AsyncMock()) as ensure_graph,
            patch.object(app_main, "_ensure_model_usage_tables", new=AsyncMock()) as ensure_usage,
            patch.object(app_main, "_ensure_format_preset_table", new=AsyncMock()) as ensure_preset,
            patch.object(app_main, "_sync_kb_on_startup", new=AsyncMock()),
            patch.object(app_main, "_schedule_startup_background_task", side_effect=_fake_schedule) as schedule_task,
        ):
            await app_main._run_singleton_startup_tasks(123)

        ensure_status.assert_awaited_once()
        ensure_graph.assert_awaited_once()
        ensure_usage.assert_awaited_once()
        ensure_preset.assert_awaited_once()
        schedule_task.assert_called_once()
        self.assertEqual(scheduled, ["kb-sync"])

    async def test_run_singleton_startup_tasks_skips_when_lock_missing(self):
        with (
            patch.object(app_main, "_ensure_document_status_enum", new=AsyncMock()) as ensure_status,
            patch.object(app_main, "_ensure_graph_tables", new=AsyncMock()) as ensure_graph,
            patch.object(app_main, "_ensure_model_usage_tables", new=AsyncMock()) as ensure_usage,
            patch.object(app_main, "_ensure_format_preset_table", new=AsyncMock()) as ensure_preset,
            patch.object(app_main, "_sync_kb_on_startup", new=AsyncMock()),
            patch.object(app_main, "_schedule_startup_background_task") as schedule_task,
        ):
            await app_main._run_singleton_startup_tasks(None)

        ensure_status.assert_not_awaited()
        ensure_graph.assert_not_awaited()
        ensure_usage.assert_not_awaited()
        ensure_preset.assert_not_awaited()
        schedule_task.assert_not_called()

    async def test_run_singleton_startup_tasks_continues_when_one_step_warns(self):
        scheduled = []

        async def _fail_once():
            raise RuntimeError("graph broken")

        def _fake_schedule(coro, task_name):
            scheduled.append(task_name)
            coro.close()

        with (
            patch.object(app_main, "_ensure_document_status_enum", new=AsyncMock()) as ensure_status,
            patch.object(app_main, "_ensure_graph_tables", side_effect=_fail_once) as ensure_graph,
            patch.object(app_main, "_ensure_model_usage_tables", new=AsyncMock()) as ensure_usage,
            patch.object(app_main, "_ensure_format_preset_table", new=AsyncMock()) as ensure_preset,
            patch.object(app_main, "_sync_kb_on_startup", new=AsyncMock()),
            patch.object(app_main, "_schedule_startup_background_task", side_effect=_fake_schedule),
            patch.object(app_main.logger, "warning") as warning_log,
        ):
            await app_main._run_singleton_startup_tasks(123)

        ensure_status.assert_awaited_once()
        ensure_graph.assert_awaited_once()
        ensure_usage.assert_awaited_once()
        ensure_preset.assert_awaited_once()
        self.assertEqual(scheduled, ["kb-sync"])
        warning_log.assert_any_call("启动阶段失败 [%s]: %s", "graph", unittest.mock.ANY)

    async def test_cancel_startup_background_tasks_cancels_pending_tasks(self):
        gate = asyncio.Event()

        async def _pending_task():
            await gate.wait()

        task = asyncio.create_task(_pending_task())
        app_main._startup_background_tasks.add(task)
        await app_main._cancel_startup_background_tasks()

        self.assertTrue(task.cancelled())
        self.assertFalse(app_main._startup_background_tasks)

    def test_acquire_startup_lock_returns_none_on_contention(self):
        with (
            patch("app.main.os.open", return_value=88),
            patch("app.main.fcntl.flock", side_effect=BlockingIOError(errno.EAGAIN, "busy")),
            patch("app.main.os.close") as close_fd,
        ):
            lock_fd = app_main._acquire_startup_lock()

        self.assertIsNone(lock_fd)
        close_fd.assert_called_once_with(88)

    async def test_schedule_startup_background_task_logs_warning_on_failure(self):
        async def _boom():
            raise RuntimeError("kb sync failed")

        with patch.object(app_main.logger, "warning") as warning_log:
            task = app_main._schedule_startup_background_task(_boom(), "kb-sync")
            await asyncio.gather(task, return_exceptions=True)

        self.assertFalse(app_main._startup_background_tasks)
        warning_log.assert_any_call("启动后台任务失败 [%s]: %s", "kb-sync", unittest.mock.ANY)


if __name__ == "__main__":
    unittest.main()
