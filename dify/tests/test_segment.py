"""
Document Segment API 测试 - 文档分段管理

这个文件测试 Dify 的文档分段 API:
- 获取文档分段列表
- 添加文档分段
- 更新文档分段
- 删除文档分段

运行测试:
pytest tests/test_segment.py -v
"""

import pytest
from unittest.mock import AsyncMock, patch
from services.dify import DifyClient, DatasetService, DifyError


@pytest.fixture
def dify_client(test_base_url):
    """创建测试客户端"""
    return DifyClient(base_url=test_base_url)


@pytest.fixture
def dataset_service(dify_client):
    """创建数据集服务"""
    return DatasetService(dify_client)


@pytest.fixture
def sample_segment_list_response():
    """示例分段列表响应"""
    return {
        "data": [
            {
                "id": "seg-123",
                "position": 1,
                "document_id": "doc-456",
                "content": "第二十一条 国家建立数据分类分级保护制度，根据数据在经济社会发展中的重要程度，以及一旦遭到篡改、破坏、泄露或者非法获取、非法利用，对国家安全、公共利益或者个人、组织合法权益造成的危害程度，对数据实行分类分级保护。",
                "answer": "",
                "word_count": 95,
                "tokens": 120,
                "keywords": ["数据分类", "分级保护", "国家安全"],
                "index_node_id": "node-789",
                "index_node_hash": "hash-abc123",
                "hit_count": 15,
                "enabled": True,
                "disabled_at": None,
                "disabled_by": None,
                "status": "completed",
                "created_by": "user-123",
                "created_at": 1695636173,
                "indexing_at": 1695636180,
                "completed_at": 1695636185,
                "error": None,
                "stopped_at": None
            },
            {
                "id": "seg-456",
                "position": 2,
                "document_id": "doc-456",
                "content": "数据分类分级是指根据数据的重要性、敏感性和对组织的价值，将数据划分为不同的类别和级别，并采取相应的保护措施。",
                "answer": "数据分类分级是一种数据管理方法，通过评估数据的重要性和敏感性来确定保护级别。",
                "word_count": 52,
                "tokens": 65,
                "keywords": ["数据分类", "敏感性", "保护措施"],
                "hit_count": 10,
                "enabled": True,
                "status": "completed",
                "created_at": 1695636200
            }
        ],
        "doc_form": "text_model"
    }


@pytest.mark.unit
class TestSegmentList:
    """文档分段列表测试"""
    
    @pytest.mark.asyncio
    async def test_list_segments(
        self, dataset_service, mock_api_keys, sample_segment_list_response, mock_http_response
    ):
        """测试获取文档分段列表"""
        with patch.object(dataset_service._client, 'get') as mock_get:
            mock_response = mock_http_response(
                status_code=200,
                json_data=sample_segment_list_response
            )
            mock_get.return_value = mock_response
            
            result = await dataset_service.list_segments(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-456"
            )
            
            assert "data" in result
            assert len(result["data"]) == 2
            assert result["doc_form"] == "text_model"
            
            # 验证第一个分段
            first_segment = result["data"][0]
            assert first_segment["id"] == "seg-123"
            assert first_segment["position"] == 1
            assert first_segment["word_count"] == 95
            assert first_segment["enabled"] is True
            
            # 验证请求路径
            call_args = mock_get.call_args
            assert "/datasets/dataset-123/documents/doc-456/segments" in call_args[0][0]
    
    @pytest.mark.asyncio
    async def test_list_segments_empty(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试空分段列表"""
        empty_response = {
            "data": [],
            "doc_form": "text_model"
        }
        
        with patch.object(dataset_service._client, 'get') as mock_get:
            mock_response = mock_http_response(
                status_code=200,
                json_data=empty_response
            )
            mock_get.return_value = mock_response
            
            result = await dataset_service.list_segments(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-456"
            )
            
            assert result["data"] == []
    
    @pytest.mark.asyncio
    async def test_list_segments_with_qa_pairs(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试包含问答对的分段列表"""
        qa_response = {
            "data": [
                {
                    "id": "seg-qa-1",
                    "position": 1,
                    "document_id": "doc-qa",
                    "content": "什么是数据分类分级？",
                    "answer": "数据分类分级是指根据数据的重要性、敏感性和对组织的价值，将数据划分为不同的类别和级别。",
                    "keywords": ["数据分类", "分级"],
                    "enabled": True,
                    "status": "completed"
                }
            ],
            "doc_form": "qa_model"
        }
        
        with patch.object(dataset_service._client, 'get') as mock_get:
            mock_response = mock_http_response(
                status_code=200,
                json_data=qa_response
            )
            mock_get.return_value = mock_response
            
            result = await dataset_service.list_segments(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-qa"
            )
            
            assert result["doc_form"] == "qa_model"
            assert len(result["data"]) == 1
            
            segment = result["data"][0]
            assert segment["content"] == "什么是数据分类分级？"
            assert segment["answer"] != ""


@pytest.mark.unit
class TestSegmentAdd:
    """添加文档分段测试"""
    
    @pytest.mark.asyncio
    async def test_add_segments(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试添加文档分段"""
        add_response = {
            "data": [
                {
                    "id": "seg-new-1",
                    "position": 3,
                    "document_id": "doc-456",
                    "content": "新增的分段内容",
                    "answer": "",
                    "keywords": ["关键词1", "关键词2"],
                    "enabled": True,
                    "status": "completed"
                }
            ],
            "doc_form": "text_model"
        }
        
        with patch.object(dataset_service._client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=add_response
            )
            mock_post.return_value = mock_response
            
            segments = [
                {
                    "content": "新增的分段内容",
                    "answer": "",
                    "keywords": ["关键词1", "关键词2"]
                }
            ]
            
            result = await dataset_service.add_segments(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-456",
                segments=segments
            )
            
            assert "data" in result
            assert len(result["data"]) == 1
            assert result["data"][0]["id"] == "seg-new-1"
            assert result["data"][0]["content"] == "新增的分段内容"
            
            # 验证请求参数
            call_args = mock_post.call_args
            assert call_args[1]["json_body"]["segments"] == segments
    
    @pytest.mark.asyncio
    async def test_add_qa_segments(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试添加问答对分段"""
        qa_response = {
            "data": [
                {
                    "id": "seg-qa-new",
                    "position": 1,
                    "document_id": "doc-qa",
                    "content": "什么是网络安全？",
                    "answer": "网络安全是指保护网络系统免受未经授权的访问、使用、披露、破坏、修改或销毁的措施和实践。",
                    "keywords": ["网络安全", "保护"],
                    "enabled": True,
                    "status": "completed"
                }
            ],
            "doc_form": "qa_model"
        }
        
        with patch.object(dataset_service._client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=qa_response
            )
            mock_post.return_value = mock_response
            
            segments = [
                {
                    "content": "什么是网络安全？",
                    "answer": "网络安全是指保护网络系统免受未经授权的访问、使用、披露、破坏、修改或销毁的措施和实践。",
                    "keywords": ["网络安全", "保护"]
                }
            ]
            
            result = await dataset_service.add_segments(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-qa",
                segments=segments
            )
            
            assert result["doc_form"] == "qa_model"
            assert result["data"][0]["answer"] != ""
    
    @pytest.mark.asyncio
    async def test_add_multiple_segments(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试批量添加分段"""
        batch_response = {
            "data": [
                {
                    "id": f"seg-batch-{i}",
                    "position": i + 1,
                    "content": f"分段内容 {i}",
                    "enabled": True
                }
                for i in range(3)
            ],
            "doc_form": "text_model"
        }
        
        with patch.object(dataset_service._client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=batch_response
            )
            mock_post.return_value = mock_response
            
            segments = [
                {"content": f"分段内容 {i}", "keywords": []}
                for i in range(3)
            ]
            
            result = await dataset_service.add_segments(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-456",
                segments=segments
            )
            
            assert len(result["data"]) == 3


@pytest.mark.unit
class TestSegmentUpdate:
    """更新文档分段测试"""
    
    @pytest.mark.asyncio
    async def test_update_segment_content(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试更新分段内容"""
        update_response = {
            "data": [
                {
                    "id": "seg-123",
                    "position": 1,
                    "content": "更新后的分段内容",
                    "answer": "",
                    "keywords": ["关键词1"],
                    "enabled": True,
                    "status": "completed"
                }
            ],
            "doc_form": "text_model"
        }
        
        with patch.object(dataset_service._client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=update_response
            )
            mock_post.return_value = mock_response
            
            result = await dataset_service.update_segment(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-456",
                segment_id="seg-123",
                content="更新后的分段内容"
            )
            
            assert result["data"][0]["content"] == "更新后的分段内容"
            
            # 验证请求参数
            call_args = mock_post.call_args
            assert call_args[1]["json_body"]["segment"]["content"] == "更新后的分段内容"
    
    @pytest.mark.asyncio
    async def test_update_segment_answer(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试更新分段答案"""
        update_response = {
            "data": [
                {
                    "id": "seg-qa-1",
                    "content": "什么是数据分类分级？",
                    "answer": "更新后的答案内容",
                    "enabled": True
                }
            ],
            "doc_form": "qa_model"
        }
        
        with patch.object(dataset_service._client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=update_response
            )
            mock_post.return_value = mock_response
            
            result = await dataset_service.update_segment(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-qa",
                segment_id="seg-qa-1",
                answer="更新后的答案内容"
            )
            
            assert result["data"][0]["answer"] == "更新后的答案内容"
    
    @pytest.mark.asyncio
    async def test_update_segment_keywords(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试更新分段关键词"""
        update_response = {
            "data": [
                {
                    "id": "seg-123",
                    "content": "分段内容",
                    "keywords": ["新关键词1", "新关键词2", "新关键词3"],
                    "enabled": True
                }
            ],
            "doc_form": "text_model"
        }
        
        with patch.object(dataset_service._client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=update_response
            )
            mock_post.return_value = mock_response
            
            new_keywords = ["新关键词1", "新关键词2", "新关键词3"]
            
            result = await dataset_service.update_segment(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-456",
                segment_id="seg-123",
                keywords=new_keywords
            )
            
            assert result["data"][0]["keywords"] == new_keywords
    
    @pytest.mark.asyncio
    async def test_disable_segment(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试禁用分段"""
        update_response = {
            "data": [
                {
                    "id": "seg-123",
                    "content": "分段内容",
                    "enabled": False,
                    "disabled_at": 1695636300,
                    "disabled_by": "user-789"
                }
            ],
            "doc_form": "text_model"
        }
        
        with patch.object(dataset_service._client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=update_response
            )
            mock_post.return_value = mock_response
            
            result = await dataset_service.update_segment(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-456",
                segment_id="seg-123",
                enabled=False
            )
            
            assert result["data"][0]["enabled"] is False
            assert "disabled_at" in result["data"][0]
    
    @pytest.mark.asyncio
    async def test_update_segment_multiple_fields(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试同时更新多个字段"""
        update_response = {
            "data": [
                {
                    "id": "seg-123",
                    "content": "新内容",
                    "answer": "新答案",
                    "keywords": ["新关键词"],
                    "enabled": True
                }
            ],
            "doc_form": "qa_model"
        }
        
        with patch.object(dataset_service._client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=update_response
            )
            mock_post.return_value = mock_response
            
            result = await dataset_service.update_segment(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-qa",
                segment_id="seg-123",
                content="新内容",
                answer="新答案",
                keywords=["新关键词"],
                enabled=True
            )
            
            segment = result["data"][0]
            assert segment["content"] == "新内容"
            assert segment["answer"] == "新答案"
            assert segment["keywords"] == ["新关键词"]
            assert segment["enabled"] is True


@pytest.mark.unit
class TestSegmentDelete:
    """删除文档分段测试"""
    
    @pytest.mark.asyncio
    async def test_delete_segment(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试删除分段"""
        with patch.object(dataset_service._client, 'delete') as mock_delete:
            mock_response = mock_http_response(status_code=204)
            mock_delete.return_value = mock_response
            
            await dataset_service.delete_segment(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-456",
                segment_id="seg-123"
            )
            
            # 验证请求路径
            call_args = mock_delete.call_args
            assert "/datasets/dataset-123/documents/doc-456/segments/seg-123" in call_args[0][0]
    
    @pytest.mark.asyncio
    async def test_delete_segment_not_found(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试删除不存在的分段"""
        error_response = {
            "code": "segment_not_found",
            "message": "Segment not found",
            "status": 404
        }
        
        with patch.object(dataset_service._client, 'delete') as mock_delete:
            async def raise_error(*args, **kwargs):
                from services.dify.exceptions import DifyError
                raise DifyError(
                    message="Segment not found",
                    code="segment_not_found",
                    status_code=404,
                    raw_response=error_response
                )
            
            mock_delete.side_effect = raise_error
            
            with pytest.raises(DifyError) as exc_info:
                await dataset_service.delete_segment(
                    api_key=mock_api_keys["dataset"],
                    dataset_id="dataset-123",
                    document_id="doc-456",
                    segment_id="non-existent-id"
                )
            
            assert exc_info.value.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-m", "unit"])
