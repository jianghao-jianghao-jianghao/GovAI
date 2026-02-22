"""
知识图谱写入服务

负责将 Dify 实体抽取结果同时写入：
  1. PostgreSQL 关系表 (graph_entities / graph_relationships)
  2. Apache AGE 图数据库 (knowledge_graph)

使用场景：
  - 知识库文件索引完成后自动触发
  - POST /graph/extract 手动抽取
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional
from uuid import UUID

import asyncpg
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.models.graph import GraphEntity, GraphRelationship
from app.services.dify.base import EntityTriple

logger = logging.getLogger(__name__)

# AGE 图名（与 schema.sql 中 create_graph 一致）
AGE_GRAPH_NAME = "knowledge_graph"


def _escape_cypher(value: str) -> str:
    """转义 Cypher 字符串中的特殊字符，防止注入"""
    return value.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')


def _to_age_label(text: str) -> str:
    """
    将中文关系类型转换为合法的 AGE/Cypher 标签。
    AGE 标签只允许 字母、数字、下划线，且不能以数字开头。
    中文字符会被保留（AGE 1.6 支持），特殊符号会被替换为下划线。
    """
    if not text or not text.strip():
        return "RELATION"
    cleaned = re.sub(r"[^\w\u4e00-\u9fff]", "_", text.strip())
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    if not cleaned:
        return "RELATION"
    # 不能以数字开头
    if cleaned[0].isdigit():
        cleaned = "R_" + cleaned
    return cleaned


class GraphService:
    """
    知识图谱写入服务 —— 双写 PostgreSQL 关系表 + Apache AGE 图。
    """

    def __init__(self):
        self._age_pool: Optional[asyncpg.Pool] = None

    # ── AGE 连接管理 ──────────────────────────────────────────

    async def _get_age_pool(self) -> asyncpg.Pool:
        """获取 AGE 连接池（懒初始化）"""
        if self._age_pool is None:
            # 从 DATABASE_URL 转换为 asyncpg DSN
            # DATABASE_URL 格式: postgresql+asyncpg://user:pass@host:port/db
            dsn = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
            try:
                self._age_pool = await asyncpg.create_pool(dsn=dsn, min_size=2, max_size=10)
                logger.info("AGE 连接池初始化成功")
            except Exception as e:
                logger.error(f"AGE 连接池初始化失败: {e}")
                raise
        return self._age_pool

    async def _execute_cypher(self, cypher: str) -> list:
        """执行 Cypher 查询"""
        pool = await self._get_age_pool()
        async with pool.acquire() as conn:
            try:
                await conn.execute("LOAD 'age';")
                await conn.execute("SET search_path = ag_catalog, '$user', public;")
                query = f"SELECT * FROM cypher('{AGE_GRAPH_NAME}', $$ {cypher} $$) AS (result agtype);"
                return await conn.fetch(query)
            except Exception as e:
                logger.warning(f"Cypher 执行异常: {e}")
                raise

    async def _age_upsert_entity(
        self, name: str, entity_type: str, source_doc_id: str
    ) -> None:
        """在 AGE 中幂等写入实体节点"""
        safe_name = _escape_cypher(name)
        safe_type = _escape_cypher(entity_type)
        safe_doc = _escape_cypher(source_doc_id)

        cypher = (
            f"MERGE (n:Entity {{name: '{safe_name}', type: '{safe_type}'}}) "
            f"SET n.source_doc_id = '{safe_doc}' "
            f"RETURN n"
        )
        await self._execute_cypher(cypher)

    async def _age_upsert_relationship(
        self,
        source_name: str,
        target_name: str,
        relation: str,
        source_doc_id: str,
    ) -> None:
        """在 AGE 中幂等写入关系边，使用真实关系类型作为标签"""
        safe_src = _escape_cypher(source_name)
        safe_tgt = _escape_cypher(target_name)
        safe_rel = _escape_cypher(relation)
        safe_doc = _escape_cypher(source_doc_id)

        # AGE 标签只允许字母、数字、下划线，中文需转成合法标签
        label = _to_age_label(relation)

        cypher = (
            f"MATCH (a:Entity {{name: '{safe_src}'}}), (b:Entity {{name: '{safe_tgt}'}}) "
            f"MERGE (a)-[r:{label} {{type: '{safe_rel}'}}]->(b) "
            f"SET r.source_doc_id = '{safe_doc}' "
            f"RETURN r"
        )
        await self._execute_cypher(cypher)

    async def _age_delete_by_doc(self, source_doc_id: str) -> None:
        """按来源文档 ID 从 AGE 中删除相关实体和关系"""
        safe_doc = _escape_cypher(source_doc_id)
        cypher = f"MATCH (n {{source_doc_id: '{safe_doc}'}}) DETACH DELETE n"
        try:
            await self._execute_cypher(cypher)
        except Exception as e:
            logger.warning(f"AGE 按文档删除失败: {e}")

    # ── 核心写入方法 ──────────────────────────────────────────

    async def ingest_triples(
        self,
        db: AsyncSession,
        triples: List[EntityTriple],
        source_doc_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """
        将三元组同时写入 PostgreSQL 关系表 + Apache AGE 图数据库。

        Args:
            db: SQLAlchemy 异步会话
            triples: Dify 抽取返回的三元组列表
            source_doc_id: 来源文档 ID（可选）

        Returns:
            {
                "nodes_created": 5,
                "edges_created": 8,
                "age_synced": True,
                "errors": []
            }
        """
        if not triples:
            return {
                "nodes_created": 0,
                "edges_created": 0,
                "age_synced": False,
                "errors": [],
            }

        doc_id_str = str(source_doc_id) if source_doc_id else ""
        entity_cache: dict[tuple[str, str], GraphEntity] = {}
        nodes_created = 0
        edges_created = 0
        edges_total = 0          # 包含已存在的关系
        errors: list[str] = []

        # ── 1. 写入 PostgreSQL 关系表 ──

        async def _get_or_create_entity(name: str, entity_type: str) -> GraphEntity:
            nonlocal nodes_created
            key = (name.strip(), entity_type.strip() or "未知")
            if key in entity_cache:
                entity = entity_cache[key]
                # 已缓存的实体，权重 +1
                entity.weight = (entity.weight or 10) + 1
                return entity

            # 查询数据库是否已有
            result = await db.execute(
                select(GraphEntity).where(
                    GraphEntity.name == key[0],
                    GraphEntity.entity_type == key[1],
                )
            )
            entity = result.scalar_one_or_none()

            if entity:
                entity.weight = (entity.weight or 10) + 1
            else:
                entity = GraphEntity(
                    name=key[0],
                    entity_type=key[1],
                    source_doc_id=source_doc_id,
                )
                db.add(entity)
                await db.flush()
                nodes_created += 1

            entity_cache[key] = entity
            return entity

        for triple in triples:
            try:
                source_entity = await _get_or_create_entity(triple.source, triple.source_type)
                target_entity = await _get_or_create_entity(triple.target, triple.target_type)

                rel = GraphRelationship(
                    source_entity_id=source_entity.id,
                    target_entity_id=target_entity.id,
                    relation_type=triple.relation.strip(),
                    relation_desc=triple.relation.strip(),
                    source_doc_id=source_doc_id,
                )
                # 使用 SAVEPOINT（begin_nested）处理 UNIQUE 约束冲突
                edges_total += 1
                try:
                    async with db.begin_nested():
                        db.add(rel)
                        await db.flush()
                    edges_created += 1
                except IntegrityError:
                    # 重复关系 → SAVEPOINT 已自动回滚，跳过
                    logger.debug(
                        f"关系已存在，跳过: {triple.source} --[{triple.relation}]--> {triple.target}"
                    )
            except Exception as e:
                errors.append(f"PG写入三元组失败 [{triple.source}->{triple.target}]: {e}")
                logger.warning(errors[-1])

        # ── 2. 同步写入 Apache AGE 图数据库 ──

        age_synced = False
        try:
            # 写入实体节点
            for (name, entity_type) in entity_cache.keys():
                try:
                    await self._age_upsert_entity(name, entity_type, doc_id_str)
                except Exception as e:
                    errors.append(f"AGE写入实体失败 [{name}]: {e}")
                    logger.warning(errors[-1])

            # 写入关系边
            for triple in triples:
                try:
                    await self._age_upsert_relationship(
                        source_name=triple.source.strip(),
                        target_name=triple.target.strip(),
                        relation=triple.relation.strip(),
                        source_doc_id=doc_id_str,
                    )
                except Exception as e:
                    errors.append(f"AGE写入关系失败 [{triple.source}->{triple.target}]: {e}")
                    logger.warning(errors[-1])

            age_synced = True
            logger.info(
                f"图谱写入完成: PG({nodes_created}节点, {edges_created}边), "
                f"AGE已同步, 文档={doc_id_str}"
            )
        except Exception as e:
            # AGE 写入失败不影响 PostgreSQL 的写入
            logger.error(f"AGE 图同步失败（PG 数据已写入）: {e}")
            errors.append(f"AGE同步失败: {e}")

        return {
            "nodes_created": nodes_created,
            "edges_created": edges_created,
            "nodes_total": len(entity_cache),
            "edges_total": edges_total,
            "age_synced": age_synced,
            "errors": errors,
        }

    async def update_entity(
        self,
        db: AsyncSession,
        entity_id: UUID,
        **fields,
    ) -> Optional[GraphEntity]:
        """
        更新单个实体节点（PostgreSQL + AGE 双写）。
        支持更新: name, entity_type, weight, properties
        """
        result = await db.execute(
            select(GraphEntity).where(GraphEntity.id == entity_id)
        )
        entity = result.scalar_one_or_none()
        if not entity:
            return None

        old_name = entity.name
        old_type = entity.entity_type

        for key, value in fields.items():
            if value is not None and hasattr(entity, key):
                setattr(entity, key, value)

        await db.flush()

        # 同步更新 AGE
        try:
            new_name = entity.name
            new_type = entity.entity_type
            safe_old = _escape_cypher(old_name)
            safe_new = _escape_cypher(new_name)
            safe_type = _escape_cypher(new_type)

            cypher = (
                f"MATCH (n:Entity {{name: '{safe_old}'}}) "
                f"SET n.name = '{safe_new}', n.type = '{safe_type}' "
                f"RETURN n"
            )
            await self._execute_cypher(cypher)
        except Exception as e:
            logger.warning(f"AGE 更新实体失败 [{entity_id}]: {e}")

        return entity

    async def delete_entity(
        self,
        db: AsyncSession,
        entity_id: UUID,
    ) -> bool:
        """
        删除单个实体节点及其关联边（PostgreSQL + AGE 双删）。
        """
        from sqlalchemy import delete as sql_delete

        result = await db.execute(
            select(GraphEntity).where(GraphEntity.id == entity_id)
        )
        entity = result.scalar_one_or_none()
        if not entity:
            return False

        entity_name = entity.name

        # 先删关系再删实体
        await db.execute(
            sql_delete(GraphRelationship).where(
                (GraphRelationship.source_entity_id == entity_id)
                | (GraphRelationship.target_entity_id == entity_id)
            )
        )
        await db.execute(
            sql_delete(GraphEntity).where(GraphEntity.id == entity_id)
        )
        await db.flush()

        # AGE 中删除
        try:
            safe_name = _escape_cypher(entity_name)
            cypher = f"MATCH (n:Entity {{name: '{safe_name}'}}) DETACH DELETE n"
            await self._execute_cypher(cypher)
        except Exception as e:
            logger.warning(f"AGE 删除实体失败 [{entity_id}]: {e}")

        return True

    async def delete_entities_batch(
        self,
        db: AsyncSession,
        entity_ids: List[UUID],
    ) -> int:
        """
        批量删除实体节点及其关联边（PostgreSQL + AGE 双删）。
        返回实际删除的数量。
        """
        from sqlalchemy import delete as sql_delete

        # 先取出名称用于 AGE 清理
        result = await db.execute(
            select(GraphEntity).where(GraphEntity.id.in_(entity_ids))
        )
        entities = result.scalars().all()
        if not entities:
            return 0

        names = [e.name for e in entities]
        found_ids = [e.id for e in entities]

        # 删关系
        await db.execute(
            sql_delete(GraphRelationship).where(
                (GraphRelationship.source_entity_id.in_(found_ids))
                | (GraphRelationship.target_entity_id.in_(found_ids))
            )
        )
        # 删实体
        await db.execute(
            sql_delete(GraphEntity).where(GraphEntity.id.in_(found_ids))
        )
        await db.flush()

        # AGE 批量删除
        for name in names:
            try:
                safe_name = _escape_cypher(name)
                cypher = f"MATCH (n:Entity {{name: '{safe_name}'}}) DETACH DELETE n"
                await self._execute_cypher(cypher)
            except Exception as e:
                logger.warning(f"AGE 批量删除实体失败 [{name}]: {e}")

        return len(found_ids)

    async def delete_by_doc(
        self, db: AsyncSession, source_doc_id: UUID
    ) -> None:
        """
        按来源文档 ID 删除图谱数据（PostgreSQL + AGE 双删）。
        用于文件删除时清理关联的图谱节点和关系。
        """
        # 1. 删除 PostgreSQL 中的关系
        from sqlalchemy import delete

        await db.execute(
            delete(GraphRelationship).where(
                GraphRelationship.source_doc_id == source_doc_id
            )
        )
        await db.execute(
            delete(GraphEntity).where(
                GraphEntity.source_doc_id == source_doc_id
            )
        )
        await db.flush()

        # 2. 删除 AGE 中的数据
        try:
            await self._age_delete_by_doc(str(source_doc_id))
        except Exception as e:
            logger.warning(f"AGE 数据清理失败 [doc={source_doc_id}]: {e}")

    async def close(self) -> None:
        """关闭 AGE 连接池"""
        if self._age_pool:
            await self._age_pool.close()
            self._age_pool = None


# ── 单例 ──

_graph_service: Optional[GraphService] = None


def get_graph_service() -> GraphService:
    """获取 GraphService 单例"""
    global _graph_service
    if _graph_service is None:
        _graph_service = GraphService()
    return _graph_service
