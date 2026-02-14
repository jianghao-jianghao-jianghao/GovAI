from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import os
import json

from .client import DifyClient, DifyClientConfig
from .dataset import DatasetService
from .workflow import WorkflowService

router = APIRouter(prefix="/dify", tags=["Dify Integration"])

# --- 配置管理 ---
DIFY_BASE_URL = os.getenv("DIFY_API_BASE_URL", "https://api.dify.ai/v1")
DIFY_DATASET_KEY = os.getenv("DIFY_DATASET_API_KEY", "")
DIFY_WORKFLOW_KEY = os.getenv("DIFY_WORKFLOW_API_KEY", "")

def get_dify_config():
    return DifyClientConfig(base_url=DIFY_BASE_URL)

def get_dataset_service(config: DifyClientConfig = Depends(get_dify_config)):
    client = DifyClient(config)
    return DatasetService(client, DIFY_DATASET_KEY)

def get_workflow_service(config: DifyClientConfig = Depends(get_dify_config)):
    client = DifyClient(config)
    return WorkflowService(client) # WorkflowService 现在需要在调用方法时传入 api_key

# --- 知识库接口 (Dataset API) ---

@router.post("/datasets", summary="创建新知识库")
async def create_dataset(name: str, description: str = "", service: DatasetService = Depends(get_dataset_service)):
    """
    甲方前端调用此接口创建一个新的分类文件夹。
    """
    try:
        dataset_id = await service.create_dataset(name, description)
        return {"status": "success", "dataset_id": dataset_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dify Dataset Creation Failed: {str(e)}")

@router.post("/datasets/{dataset_id}/upload", summary="上传并同步文档")
async def upload_document(
    dataset_id: str, 
    file: UploadFile = File(...), 
    service: DatasetService = Depends(get_dataset_service)
):
    """
    甲方前端上传文件，后端自动同步到 Dify 知识库并开始索引。
    """
    try:
        content = await file.read()
        result = await service.upload_document(
            dataset_id=dataset_id,
            file_bytes=content,
            filename=file.filename,
            content_type=file.content_type
        )
        return {
            "status": "success", 
            "document_id": result.get("document", {}).get("id"),
            "batch": result.get("batch")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dify Upload Failed: {str(e)}")

@router.get("/datasets/{dataset_id}/documents/{batch}/status", summary="查询导入进度")
async def get_indexing_status(dataset_id: str, batch: str, service: DatasetService = Depends(get_dataset_service)):
    """
    前端通过轮询此接口，获取文档的解析状态（indexing/completed/error）。
    """
    return await service.get_indexing_status(dataset_id, batch)

# --- 公文处理接口 (Workflow API) ---

class WorkflowRunRequest(BaseModel):
    inputs: Dict[str, Any]
    user: str = "admin"

@router.post("/workflow/run", summary="执行公文处理（起草/审查/优化/抽取）")
async def run_dify_workflow(req: WorkflowRunRequest, service: WorkflowService = Depends(get_workflow_service)):
    """
    统一的工作流执行入口。根据 inputs 里的参数决定具体业务逻辑。
    参考《分工.md》中的变量定义。
    """
    try:
        # 使用配置的 Workflow API Key 执行
        outputs = await service.run_workflow_blocking(
            api_key=DIFY_WORKFLOW_KEY,
            inputs=req.inputs,
            user=req.user
        )
        return {"status": "success", "data": outputs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Workflow Execution Failed: {str(e)}")

@router.delete("/datasets/{dataset_id}/documents/{document_id}", summary="删除文档")
async def delete_document(dataset_id: str, document_id: str, service: DatasetService = Depends(get_dataset_service)):
    try:
        await service.delete_document(dataset_id, document_id)
        return {"status": "success", "message": "Document deleted from Dify"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
