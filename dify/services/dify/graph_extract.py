import logging
from typing import Any, Dict, List, Optional
from .workflow import WorkflowService
from ..graph.age_client import AgeClient

logger = logging.getLogger(__name__)

class GraphExtractService:
    """实体关系抽取服务，连接 Dify 工作流与 Apache AGE 图数据库。"""

    def __init__(
        self,
        workflow_service: WorkflowService,
        age_client: AgeClient,
        api_key: str,
    ):
        self._workflow_service = workflow_service
        self._age_client = age_client
        self._api_key = api_key

    async def extract_and_ingest(
        self,
        *,
        text: str,
        source_doc_id: str,
        user: str = "system",
    ) -> Dict[str, Any]:
        """
        执行抽取任务并同步写入图数据库。
        
        Args:
            text: 需要抽取的纯文本内容。
            source_doc_id: 业务侧文档 ID (kb_files.id)。
            user: 执行用户标识。
        """
        logger.info(f"Starting graph extraction for doc_id: {source_doc_id}")
        
        # 1. 调用 Dify 工作流进行抽取
        # 假设工作流输出格式为: {"entities": [...], "relationships": [...]}
        try:
            raw_result = await self._workflow_service.extract_entities(
                api_key=self._api_key,
                text=text,
                user=user,
                source_doc_id=source_doc_id
            )
        except Exception as e:
            logger.error(f"Dify extraction failed: {str(e)}")
            raise

        entities = raw_result.get("entities", [])
        relationships = raw_result.get("relationships", [])

        # 2. 写入实体
        ingested_entities = 0
        for ent in entities:
            try:
                await self._age_client.upsert_entity(
                    name=ent["name"],
                    entity_type=ent.get("type", "Unknown"),
                    source_doc_id=source_doc_id,
                    properties=ent.get("properties")
                )
                ingested_entities += 1
            except Exception as e:
                logger.warning(f"Failed to upsert entity {ent.get('name')}: {str(e)}")

        # 3. 写入关系
        ingested_rels = 0
        for rel in relationships:
            try:
                await self._age_client.upsert_relationship(
                    source_name=rel["source"],
                    relation=rel["relation"],
                    target_name=rel["target"],
                    source_doc_id=source_doc_id,
                    properties=rel.get("properties")
                )
                ingested_rels += 1
            except Exception as e:
                logger.warning(f"Failed to upsert relationship: {str(e)}")

        logger.info(f"Ingestion completed: {ingested_entities} entities, {ingested_rels} relationships.")
        
        return {
            "source_doc_id": source_doc_id,
            "entities_count": ingested_entities,
            "relationships_count": ingested_rels,
            "raw_output": raw_result
        }
