import json
import logging
from typing import Any, Dict, List, Optional

import asyncpg

logger = logging.getLogger(__name__)

class AgeClient:
    """Apache AGE 客户端，专门负责图数据的写入与维护。"""

    def __init__(
        self,
        dsn: str,
        graph_name: str = "gov_graph",
    ):
        self._dsn = dsn
        self._graph_name = graph_name
        self._pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        """初始化连接池并设置 AGE 环境。"""
        if not self._pool:
            self._pool = await asyncpg.create_pool(dsn=self._dsn)
            async with self._pool.acquire() as conn:
                # 加载 AGE 扩展
                await conn.execute("LOAD 'age';")
                await conn.execute("SET search_path = ag_catalog, '$user', public;")
                # 创建图（如果不存在）
                await conn.execute(f"SELECT create_graph('{self._graph_name}');")

    async def close(self):
        if self._pool:
            await self._pool.close()

    async def execute_cypher(self, cypher_query: str):
        """执行 Cypher 查询。"""
        if not self._pool:
            await self.connect()

        async with self._pool.acquire() as conn:
            # 必须在每次执行前设置搜索路径或在连接初始化时设置
            query = f"SELECT * FROM cypher('{self._graph_name}', $$ {cypher_query} $$) AS (a agtype);"
            return await conn.fetch(query)

    async def upsert_entity(
        self,
        name: str,
        entity_type: str,
        source_doc_id: str,
        properties: Optional[Dict[str, Any]] = None,
    ):
        """幂等写入实体节点。"""
        props = properties or {}
        props.update({
            "name": name,
            "type": entity_type,
            "source_doc_id": source_doc_id
        })
        props_str = json.dumps(props)
        
        cypher = f"""
        MERGE (n:Entity {{name: '{name}', type: '{entity_type}'}})
        SET n += {props_str}
        RETURN n
        """
        return await self.execute_cypher(cypher)

    async def upsert_relationship(
        self,
        source_name: str,
        relation: str,
        target_name: str,
        source_doc_id: str,
        properties: Optional[Dict[str, Any]] = None,
    ):
        """幂等写入关系边。"""
        props = properties or {}
        props.update({
            "relation": relation,
            "source_doc_id": source_doc_id
        })
        props_str = json.dumps(props)

        cypher = f"""
        MATCH (a:Entity {{name: '{source_name}'}}), (b:Entity {{name: '{target_name}'}})
        MERGE (a)-[r:RELATION {{type: '{relation}'}}]->(b)
        SET r += {props_str}
        RETURN r
        """
        return await self.execute_cypher(cypher)

    async def delete_by_source_doc_id(self, source_doc_id: str):
        """按来源文档 ID 删除相关的实体和关系（用于清理或重构）。"""
        # 注意：在 AGE 中删除需要先删边再删点，或者使用 DETACH DELETE
        cypher = f"""
        MATCH (n {{source_doc_id: '{source_doc_id}'}})
        DETACH DELETE n
        """
        return await self.execute_cypher(cypher)
