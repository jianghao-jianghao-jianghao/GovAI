"""
Dataset Service 扩展测试 - 补充缺失的测试用例

这个文件补充了 test_dataset.py 中缺失的测试:
- 知识库列表查询
- 知识库详情查询
- 知识库更新
- 文档列表查询
- 文档详情查询
- 文档更新

运行测试:
pytest tests/test_dataset_extended.py -v
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from services.dify import DifyClient, DatasetService, DifyError


@pytest.fixture
def dify_client(test_base_url):
    """创建测试客户端"""
    return DifyClient(base_url=test_base_url)


@pytest.fixture
def dataset_service(dify_client):
    """创建数据集服务"""
    return DatasetService(dify_client)


@pytest.mark.unit
class TestDatasetListAndDetail:
    """知识库列表和详情测试"""
    
    @pytest.mark.asyncio
    async def test_list_datasets(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试获取知识库列表"""
        list_response = {
            "data": [
                {
                    "id": "dataset-123",
                    "name": "政策法规知识库",
                    "description": "包含国家及地方政策法规文件",
                    "permission": "only_me",
                    "data_source_type": None,
                    "indexing_technique": "high_quality",
                    "app_count": 2,
                    "document_count": 15,
                    "word_count": 50000,
                    "created_by": "user-456",
                    "created_at": 1695636173,
                    "updated_by": "user-456",
                    "updated_at": 1695636200
                },
                {
                    "id": "dataset-456",
                    "name": "技术标准知识库",
                    "description": "技术规范和标准文档",
                    "permission": "all_team_members",
                    "data_source_type": None,
                    "indexing_technique": "high_quality",
                    "app_count": 1,
                    "document_count": 8,
                    "word_count": 30000,
                    "created_by": "user-789",
                    "created_at": 1695636180,
                    "updated_by": "user-789",
                    "updated_at": 1695636190
                }
            ],
            "has_more": False,
            "limit": 20,
            "total": 2,
            "page": 1
        }
        
        with patch.object(dataset_service._client, 'get') as mock_get:
            mock_response = mock_http_response(status_code=200, json_data=list_response)
            mock_get.return_value = mock_response
            
            result = await dataset_service.list_datasets(
                api_key=mock_api_keys["dataset"]
            )
            
            assert "data" in result
            assert len(result["data"]) == 2
            assert result["total"] == 2
            assert result["has_more"] is False
            
            # 验证第一个知识库
            first_dataset = result["data"][0]
            assert first_dataset["id"] == "dataset-123"
            assert first_dataset["name"] == "政策法规知识库"
            assert first_dataset["document_count"] == 15
    
    @pytest.mark.asyncio
    async def test_list_datasets_with_pagination(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试分页查询知识库列表"""
        list_response = {
            "data": [{"id": f"dataset-{i}", "name": f"知识库{i}"} for i in range(10)],
            "has_more": True,
            "limit": 10,
            "total": 25,
            "page": 1
        }
        
        with patch.object(dataset_service._client, 'get') as mock_get:
            mock_response = mock_http_response(status_code=200, json_data=list_response)
            mock_get.return_value = mock_response
            
            result = await dataset_service.list_datasets(
                api_key=mock_api_keys["dataset"],
                page=1,
                limit=10
            )
            
            assert len(result["data"]) == 10
            assert result["has_more"] is True
            assert result["total"] == 25
            
            # 验证请求参数
            call_args = mock_get.call_args
            assert "page=1" in call_args[0][0]
    
    @pytest.mark.asyncio
    async def test_list_datasets_empty(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试空知识库列表"""
        list_response = {
            "data": [],
            "has_more": False,
            "limit": 20,
            "total": 0,
            "page": 1
        }
        
        with patch.object(dataset_service._client, 'get') as mock_get:
            mock_response = mock_http_response(status_code=200, json_data=list_response)
            mock_get.return_value = mock_response
            
            result = await dataset_service.list_datasets(
                api_key=mock_api_keys["dataset"]
            )
            
            assert result["data"] == []
            assert result["total"] == 0
    
    @pytest.mark.asyncio
    async def test_get_dataset_detail(
        self, dataset_service, mock_api_keys, sample_dataset_response, mock_http_response
    ):
        """测试获取知识库详情"""
        with patch.object(dataset_service._client, 'get') as mock_get:
            mock_response = mock_http_response(status_code=200, json_data=sample_dataset_response)
            mock_get.return_value = mock_response
            
            result = await dataset_service.get_dataset(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123"
            )
            
            assert result["id"] == "d290f1ee-6c54-4b01-90e6-d701748f0851"
            assert result["name"] == "测试知识库"
            assert result["indexing_technique"] == "high_quality"
            
            # 验证请求路径
            call_args = mock_get.call_args
            assert "/datasets/dataset-123" in call_args[0][0]
    
    @pytest.mark.asyncio
    async def test_get_dataset_not_found(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试获取不存在的知识库"""
        error_response = {
            "code": "dataset_not_found",
            "message": "Dataset not found",
            "status": 404
        }
        
        # 创建一个会抛出异常的 mock
        with patch.object(dataset_service._client, 'get') as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 404
            mock_response.json.return_value = error_response
            mock_response.text = "Dataset not found"
            
            async def raise_error(*args, **kwargs):
                from services.dify.exceptions import DifyError
                raise DifyError(
                    message="Dataset not found",
                    code="dataset_not_found",
                    status_code=404,
                    raw_response=error_response
                )
            
            mock_get.side_effect = raise_error
            
            with pytest.raises(DifyError) as exc_info:
                await dataset_service.get_dataset(
                    api_key=mock_api_keys["dataset"],
                    dataset_id="non-existent-id"
                )
            
            assert exc_info.value.status_code == 404
            assert exc_info.value.code == "dataset_not_found"


@pytest.mark.unit
class TestDatasetUpdate:
    """知识库更新测试"""
    
    @pytest.mark.asyncio
    async def test_update_dataset_name(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试更新知识库名称"""
        updated_response = {
            "id": "dataset-123",
            "name": "新的知识库名称",
            "description": "原描述",
            "updated_at": 1695636300
        }
        
        with patch.object(dataset_service._client, 'patch') as mock_patch:
            mock_response = mock_http_response(status_code=200, json_data=updated_response)
            mock_patch.return_value = mock_response
            
            result = await dataset_service.update_dataset(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                name="新的知识库名称"
            )
            
            assert result["name"] == "新的知识库名称"
            
            # 验证请求参数
            call_args = mock_patch.call_args
            assert call_args[1]["json_body"]["name"] == "新的知识库名称"
    
    @pytest.mark.asyncio
    async def test_update_dataset_description(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试更新知识库描述"""
        updated_response = {
            "id": "dataset-123",
            "name": "原名称",
            "description": "新的描述信息",
            "updated_at": 1695636300
        }
        
        with patch.object(dataset_service._client, 'patch') as mock_patch:
            mock_response = mock_http_response(status_code=200, json_data=updated_response)
            mock_patch.return_value = mock_response
            
            result = await dataset_service.update_dataset(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                description="新的描述信息"
            )
            
            assert result["description"] == "新的描述信息"
    
    @pytest.mark.asyncio
    async def test_update_dataset_permission(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试更新知识库权限"""
        updated_response = {
            "id": "dataset-123",
            "name": "知识库",
            "permission": "all_team_members",
            "updated_at": 1695636300
        }
        
        with patch.object(dataset_service._client, 'patch') as mock_patch:
            mock_response = mock_http_response(status_code=200, json_data=updated_response)
            mock_patch.return_value = mock_response
            
            result = await dataset_service.update_dataset(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                permission="all_team_members"
            )
            
            assert result["permission"] == "all_team_members"


@pytest.mark.unit
class TestDocumentListAndDetail:
    """文档列表和详情测试"""
    
    @pytest.mark.asyncio
    async def test_list_documents(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试获取文档列表"""
        list_response = {
            "data": [
                {
                    "id": "doc-123",
                    "position": 1,
                    "data_source_type": "upload_file",
                    "data_source_info": {
                        "upload_file": {
                            "id": "file-456",
                            "name": "数据安全法.pdf",
                            "size": 1024000,
                            "extension": "pdf",
                            "mime_type": "application/pdf",
                            "created_by": "user-789",
                            "created_at": 1695636173
                        }
                    },
                    "dataset_process_rule_id": None,
                    "name": "数据安全法.pdf",
                    "created_from": "api",
                    "created_by": "user-789",
                    "created_at": 1695636173,
                    "tokens": 5000,
                    "indexing_status": "completed",
                    "error": None,
                    "enabled": True,
                    "disabled_at": None,
                    "disabled_by": None,
                    "archived": False,
                    "display_status": "available",
                    "word_count": 15000,
                    "hit_count": 25,
                    "doc_form": "text_model"
                },
                {
                    "id": "doc-456",
                    "position": 2,
                    "name": "数据分类分级指南.pdf",
                    "indexing_status": "completed",
                    "enabled": True,
                    "word_count": 12000,
                    "hit_count": 18
                }
            ],
            "has_more": False,
            "limit": 20,
            "total": 2,
            "page": 1
        }
        
        with patch.object(dataset_service._client, 'get') as mock_get:
            mock_response = mock_http_response(status_code=200, json_data=list_response)
            mock_get.return_value = mock_response
            
            result = await dataset_service.list_documents(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123"
            )
            
            assert "data" in result
            assert len(result["data"]) == 2
            assert result["total"] == 2
            
            # 验证第一个文档
            first_doc = result["data"][0]
            assert first_doc["id"] == "doc-123"
            assert first_doc["name"] == "数据安全法.pdf"
            assert first_doc["indexing_status"] == "completed"
            assert first_doc["word_count"] == 15000
    
    @pytest.mark.asyncio
    async def test_list_documents_with_filter(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试按状态筛选文档列表"""
        list_response = {
            "data": [
                {
                    "id": "doc-123",
                    "name": "文档1.pdf",
                    "indexing_status": "indexing"
                }
            ],
            "has_more": False,
            "limit": 20,
            "total": 1,
            "page": 1
        }
        
        with patch.object(dataset_service._client, 'get') as mock_get:
            mock_response = mock_http_response(status_code=200, json_data=list_response)
            mock_get.return_value = mock_response
            
            result = await dataset_service.list_documents(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                keyword="",
                page=1,
                limit=20
            )
            
            assert len(result["data"]) == 1
            assert result["data"][0]["indexing_status"] == "indexing"
    
    @pytest.mark.asyncio
    async def test_get_document_detail(
        self, dataset_service, mock_api_keys, sample_document_response, mock_http_response
    ):
        """测试获取文档详情"""
        detail_response = sample_document_response["document"]
        
        with patch.object(dataset_service._client, 'get') as mock_get:
            mock_response = mock_http_response(status_code=200, json_data=detail_response)
            mock_get.return_value = mock_response
            
            result = await dataset_service.get_document(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-456"
            )
            
            assert result["id"] == "a8c6c36f-9f5d-4d7a-8472-f5d7b75d71d2"
            assert result["name"] == "test.txt"
            
            # 验证请求路径
            call_args = mock_get.call_args
            assert "/datasets/dataset-123/documents/doc-456" in call_args[0][0]
    
    @pytest.mark.asyncio
    async def test_get_document_not_found(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试获取不存在的文档"""
        error_response = {
            "code": "document_not_found",
            "message": "Document not found",
            "status": 404
        }
        
        with patch.object(dataset_service._client, 'get') as mock_get:
            async def raise_error(*args, **kwargs):
                from services.dify.exceptions import DifyError
                raise DifyError(
                    message="Document not found",
                    code="document_not_found",
                    status_code=404,
                    raw_response=error_response
                )
            
            mock_get.side_effect = raise_error
            
            with pytest.raises(DifyError) as exc_info:
                await dataset_service.get_document(
                    api_key=mock_api_keys["dataset"],
                    dataset_id="dataset-123",
                    document_id="non-existent-id"
                )
            
            assert exc_info.value.status_code == 404


@pytest.mark.unit
class TestDocumentUpdate:
    """文档更新测试"""
    
    @pytest.mark.asyncio
    async def test_update_document_name(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试更新文档名称"""
        updated_response = {
            "id": "doc-123",
            "name": "新文档名称.pdf",
            "updated_at": 1695636300
        }
        
        with patch.object(dataset_service._client, 'patch') as mock_patch:
            mock_response = mock_http_response(status_code=200, json_data=updated_response)
            mock_patch.return_value = mock_response
            
            result = await dataset_service.update_document(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-123",
                name="新文档名称.pdf"
            )
            
            assert result["name"] == "新文档名称.pdf"
    
    @pytest.mark.asyncio
    async def test_enable_document(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试启用文档"""
        updated_response = {
            "id": "doc-123",
            "enabled": True,
            "updated_at": 1695636300
        }
        
        with patch.object(dataset_service._client, 'patch') as mock_patch:
            mock_response = mock_http_response(status_code=200, json_data=updated_response)
            mock_patch.return_value = mock_response
            
            result = await dataset_service.update_document(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-123",
                enabled=True
            )
            
            assert result["enabled"] is True
    
    @pytest.mark.asyncio
    async def test_disable_document(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试禁用文档"""
        updated_response = {
            "id": "doc-123",
            "enabled": False,
            "disabled_at": 1695636300,
            "disabled_by": "user-789",
            "updated_at": 1695636300
        }
        
        with patch.object(dataset_service._client, 'patch') as mock_patch:
            mock_response = mock_http_response(status_code=200, json_data=updated_response)
            mock_patch.return_value = mock_response
            
            result = await dataset_service.update_document(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-123",
                enabled=False
            )
            
            assert result["enabled"] is False
            assert "disabled_at" in result


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-m", "unit"])
