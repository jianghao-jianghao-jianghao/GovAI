import unittest

from app.services.graph_service import AGE_GRAPH_NAME, GraphService, _escape_cypher, _to_age_label


class _AcquireContext:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeConn:
    def __init__(self):
        self.executed = []
        self.fetch_args = None

    async def execute(self, query):
        self.executed.append(query)

    async def fetch(self, query, *args):
        self.fetch_args = (query, args)
        return [{"result": "ok"}]


class _FakePool:
    def __init__(self, conn):
        self._conn = conn

    def acquire(self):
        return _AcquireContext(self._conn)


class GraphServiceSecurityTest(unittest.IsolatedAsyncioTestCase):
    async def test_execute_cypher_uses_sql_parameters(self):
        service = GraphService()
        conn = _FakeConn()
        service._age_pool = _FakePool(conn)

        rows = await service._execute_cypher("MATCH (n) RETURN n")

        self.assertEqual(rows, [{"result": "ok"}])
        self.assertEqual(
            conn.fetch_args,
            (
                "SELECT * FROM cypher($1, $2) AS (result agtype);",
                (AGE_GRAPH_NAME, "MATCH (n) RETURN n"),
            ),
        )

    def test_escape_cypher_neutralizes_quotes_and_dollar_quotes(self):
        escaped = _escape_cypher("a'\"\\\\$$b")

        self.assertEqual(escaped, "a\\'\\\"\\\\\\\\＄＄b")
        self.assertNotIn("$$", escaped)

    def test_to_age_label_strips_unsafe_relation_chars(self):
        label = _to_age_label("1); DROP GRAPH x -- 合作/关系")

        self.assertEqual(label, "R_1_DROP_GRAPH_x_合作_关系")
        self.assertNotIn(";", label)
        self.assertNotIn(" ", label)


if __name__ == "__main__":
    unittest.main()
