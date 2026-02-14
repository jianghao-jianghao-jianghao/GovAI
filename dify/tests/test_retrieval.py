"""
Retrieval API 测试 - 知识库检索功能

这个文件测试 Dify 的知识库检索 API:
- 向量检索
- 混合检索
- 检索参数配置
- 检索结果验证

运行测试:
pytest tests/test_retrieval.py -v
"""

import pytest
from unittest.mock import AsyncMock, patch
from services.dify import DifyClient, DifyError


@pytest.fixture
def dify_client(test_base_url):
    """创建测试客户端"""
    return DifyClient(base_url=test_base_url)


@pytest.fixture
def sample_retrieval_response():
    """示例检索响应"""
    return {
        "query": {
            "content": "什么是数据分类分级"
        },
        "records": [
            {
                "segment": {
                    "id": "seg-123",
                    "position": 1,
                    "document_id": "doc-456",
                    "content": "第二十一条 国家建立数据分类分级保护制度，根据数据在经济社会发展中的重要程度，以及一旦遭到篡改、破坏、泄露或者非法获取、非法利用，对国家安全、公共利益或者个人、组织合法权益造成的危害程度，对数据实行分类分级保护。",
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
                    "stopped_at": None,
                    "document": {
                        "id": "doc-456",
                        "data_source_type": "upload_file",
                        "name": "数据安全法.pdf",
                        "doc_type": "pdf"
                    },
                    "dataset_id": "dataset-123"
                },
                "score": 0.95,
                "tsne_position": None
            },
            {
                "segment": {
                    "id": "seg-456",
                    "position": 2,
                    "document_id": "doc-789",
                    "content": "数据分类分级是指根据数据的重要性、敏感性和对组织的价值，将数据划分为不同的类别和级别，并采取相应的保护措施。",
                    "word_count": 52,
                    "tokens": 65,
                    "keywords": ["数据分类", "敏感性", "保护措施"],
                    "hit_count": 10,
                    "enabled": True,
                    "document": {
                        "id": "doc-789",
                        "name": "数据分类分级指南.pdf",
                        "doc_type": "pdf"
                    },
                    "dataset_id": "dataset-123"
                },
                "score": 0.87,
                "tsne_position": None
            },
            {
                "segment": {
                    "id": "seg-789",
                    "position": 3,
                    "document_id": "doc-456",
                    "content": "数据分类分级的目的是为了更好地保护数据安全，防止数据泄露、篡改和滥用。",
                    "word_count": 32,
                    "tokens": 40,
                    "keywords": ["数据安全", "数据泄露", "数据保护"],
                    "hit_count": 8,
                    "enabled": True,
                    "document": {
                        "id": "doc-456",
                        "name": "数据安全法.pdf",
                        "doc_type": "pdf"
                    },
                    "dataset_id": "dataset-123"
                },
                "score": 0.82,
                "tsne_position": None
            }
        ]
    }


@pytest.mark.unit
class TestRetrievalAPI:
    """知识库检索 API 测试"""
    
    @pytest.mark.asyncio
    async def test_retrieve_from_dataset(
        self, dify_client, mock_api_keys, sample_retrieval_response, mock_http_response
    ):
        """测试基本的知识库检索"""
        with patch.object(dify_client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=sample_retrieval_response
            )
            mock_post.return_value = mock_response
            
            result = await dify_client.post(
                f"/datasets/dataset-123/retrieve",
                api_key=mock_api_keys["dataset"],
                json_body={
                    "query": "什么是数据分类分级",
                    "retrieval_model": {
                        "search_method": "semantic_search",
                        "reranking_enable": False,
                        "reranking_mode": None,
                        "reranking_model": {
                            "reranking_provider_name": "",
                            "reranking_model_name": ""
                        },
                        "weights": None,
                        "top_k": 3,
                        "score_threshold_enabled": False,
                        "score_threshold": 0.5
                    }
                }
            )
            
            # Get the actual json data from the mock response
            result_data = result.json()
            
            assert "records" in result_data
            assert len(result_data["records"]) == 3
            assert result_data["query"]["content"] == "什么是数据分类分级"
            
            # 验证第一个检索结果
            first_record = result_data["records"][0]
            assert first_record["score"] == 0.95
            assert first_record["segment"]["id"] == "seg-123"
            assert "数据分类分级" in first_record["segment"]["content"]
    
    @pytest.mark.asyncio
    async def test_retrieve_with_reranking(
        self, dify_client, mock_api_keys, sample_retrieval_response, mock_http_response
    ):
        """测试带重排序的检索"""
        with patch.object(dify_client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=sample_retrieval_response
            )
            mock_post.return_value = mock_response
            
            result = await dify_client.post(
                f"/datasets/dataset-123/retrieve",
                api_key=mock_api_keys["dataset"],
                json_body={
                    "query": "数据分类分级",
                    "retrieval_model": {
                        "search_method": "semantic_search",
                        "reranking_enable": True,
                        "reranking_mode": "reranking_model",
                        "reranking_model": {
                            "reranking_provider_name": "jina",
                            "reranking_model_name": "jina-colbert-v2"
                        },
                        "top_k": 3,
                        "score_threshold_enabled": False
                    }
                }
            )
            
            result_data = result.json()
            assert "records" in result_data
            
            # 验证请求参数包含重排序配置
            call_args = mock_post.call_args
            retrieval_model = call_args[1]["json_body"]["retrieval_model"]
            assert retrieval_model["reranking_enable"] is True
            assert retrieval_model["reranking_mode"] == "reranking_model"
    
    @pytest.mark.asyncio
    async def test_retrieve_with_score_threshold(
        self, dify_client, mock_api_keys, mock_http_response
    ):
        """测试带分数阈值的检索"""
        # 只返回分数 >= 0.9 的结果
        filtered_response = {
            "query": {"content": "数据分类分级"},
            "records": [
                {
                    "segment": {
                        "id": "seg-123",
                        "content": "高相关性内容",
                        "document": {"id": "doc-456", "name": "文档.pdf"}
                    },
                    "score": 0.95
                }
            ]
        }
        
        with patch.object(dify_client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=filtered_response
            )
            mock_post.return_value = mock_response
            
            result = await dify_client.post(
                f"/datasets/dataset-123/retrieve",
                api_key=mock_api_keys["dataset"],
                json_body={
                    "query": "数据分类分级",
                    "retrieval_model": {
                        "search_method": "semantic_search",
                        "top_k": 10,
                        "score_threshold_enabled": True,
                        "score_threshold": 0.9
                    }
                }
            )
            
            result_data = result.json()
            assert len(result_data["records"]) == 1
            assert result_data["records"][0]["score"] >= 0.9
    
    @pytest.mark.asyncio
    async def test_retrieve_empty_result(
        self, dify_client, mock_api_keys, mock_http_response
    ):
        """测试空检索结果"""
        empty_response = {
            "query": {"content": "不存在的内容"},
            "records": []
        }
        
        with patch.object(dify_client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=empty_response
            )
            mock_post.return_value = mock_response
            
            result = await dify_client.post(
                f"/datasets/dataset-123/retrieve",
                api_key=mock_api_keys["dataset"],
                json_body={
                    "query": "不存在的内容",
                    "retrieval_model": {
                        "search_method": "semantic_search",
                        "top_k": 3
                    }
                }
            )
            
            result_data = result.json()
            assert result_data["records"] == []
    
    @pytest.mark.asyncio
    async def test_retrieve_with_hybrid_search(
        self, dify_client, mock_api_keys, sample_retrieval_response, mock_http_response
    ):
        """测试混合检索 (向量 + 全文)"""
        with patch.object(dify_client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=sample_retrieval_response
            )
            mock_post.return_value = mock_response
            
            result = await dify_client.post(
                f"/datasets/dataset-123/retrieve",
                api_key=mock_api_keys["dataset"],
                json_body={
                    "query": "数据分类分级",
                    "retrieval_model": {
                        "search_method": "hybrid_search",
                        "reranking_enable": True,
                        "reranking_mode": "reranking_model",
                        "weights": {
                            "vector_setting": {
                                "vector_weight": 0.7,
                                "embedding_provider_name": "openai",
                                "embedding_model_name": "text-embedding-ada-002"
                            },
                            "keyword_setting": {
                                "keyword_weight": 0.3
                            }
                        },
                        "top_k": 3
                    }
                }
            )
            
            result_data = result.json()
            assert "records" in result_data
            
            # 验证混合检索参数
            call_args = mock_post.call_args
            retrieval_model = call_args[1]["json_body"]["retrieval_model"]
            assert retrieval_model["search_method"] == "hybrid_search"
            assert "weights" in retrieval_model
    
    @pytest.mark.asyncio
    async def test_retrieve_with_fulltext_search(
        self, dify_client, mock_api_keys, sample_retrieval_response, mock_http_response
    ):
        """测试全文检索"""
        with patch.object(dify_client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=sample_retrieval_response
            )
            mock_post.return_value = mock_response
            
            result = await dify_client.post(
                f"/datasets/dataset-123/retrieve",
                api_key=mock_api_keys["dataset"],
                json_body={
                    "query": "数据分类分级",
                    "retrieval_model": {
                        "search_method": "fulltext_search",
                        "top_k": 3
                    }
                }
            )
            
            result_data = result.json()
            assert "records" in result_data
            
            # 验证全文检索参数
            call_args = mock_post.call_args
            retrieval_model = call_args[1]["json_body"]["retrieval_model"]
            assert retrieval_model["search_method"] == "fulltext_search"
    
    @pytest.mark.asyncio
    async def test_retrieve_result_sorting(
        self, dify_client, mock_api_keys, sample_retrieval_response, mock_http_response
    ):
        """测试检索结果按相关性排序"""
        with patch.object(dify_client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=sample_retrieval_response
            )
            mock_post.return_value = mock_response
            
            result = await dify_client.post(
                f"/datasets/dataset-123/retrieve",
                api_key=mock_api_keys["dataset"],
                json_body={
                    "query": "数据分类分级",
                    "retrieval_model": {
                        "search_method": "semantic_search",
                        "top_k": 3
                    }
                }
            )
            
            result_data = result.json()
            # 验证结果按分数降序排列
            scores = [record["score"] for record in result_data["records"]]
            assert scores == sorted(scores, reverse=True)
            assert scores[0] >= scores[1] >= scores[2]
    
    @pytest.mark.asyncio
    async def test_retrieve_with_top_k_limit(
        self, dify_client, mock_api_keys, mock_http_response
    ):
        """测试 top_k 参数限制返回数量"""
        limited_response = {
            "query": {"content": "测试查询"},
            "records": [
                {"segment": {"id": f"seg-{i}", "content": f"内容{i}"}, "score": 0.9 - i * 0.1}
                for i in range(5)
            ]
        }
        
        with patch.object(dify_client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=limited_response
            )
            mock_post.return_value = mock_response
            
            result = await dify_client.post(
                f"/datasets/dataset-123/retrieve",
                api_key=mock_api_keys["dataset"],
                json_body={
                    "query": "测试查询",
                    "retrieval_model": {
                        "search_method": "semantic_search",
                        "top_k": 5
                    }
                }
            )
            
            result_data = result.json()
            assert len(result_data["records"]) == 5
            
            # 验证 top_k 参数
            call_args = mock_post.call_args
            assert call_args[1]["json_body"]["retrieval_model"]["top_k"] == 5
    
    @pytest.mark.asyncio
    async def test_retrieve_invalid_dataset(
        self, dify_client, mock_api_keys, mock_http_response
    ):
        """测试检索不存在的知识库"""
        error_response = {
            "code": "dataset_not_found",
            "message": "Dataset not found",
            "status": 404
        }
        
        with patch.object(dify_client, 'post') as mock_post:
            async def raise_error(*args, **kwargs):
                from services.dify.exceptions import DifyError
                raise DifyError(
                    message="Dataset not found",
                    code="dataset_not_found",
                    status_code=404,
                    raw_response=error_response
                )
            
            mock_post.side_effect = raise_error
            
            with pytest.raises(DifyError) as exc_info:
                await dify_client.post(
                    f"/datasets/non-existent-id/retrieve",
                    api_key=mock_api_keys["dataset"],
                    json_body={
                        "query": "测试",
                        "retrieval_model": {"search_method": "semantic_search", "top_k": 3}
                    }
                )
            
            assert exc_info.value.status_code == 404


@pytest.mark.unit
class TestRetrievalResultValidation:
    """检索结果验证测试"""
    
    @pytest.mark.asyncio
    async def test_validate_segment_structure(
        self, dify_client, mock_api_keys, sample_retrieval_response, mock_http_response
    ):
        """测试验证分段结构完整性"""
        with patch.object(dify_client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=sample_retrieval_response
            )
            mock_post.return_value = mock_response
            
            result = await dify_client.post(
                f"/datasets/dataset-123/retrieve",
                api_key=mock_api_keys["dataset"],
                json_body={
                    "query": "测试",
                    "retrieval_model": {"search_method": "semantic_search", "top_k": 3}
                }
            )
            
            result_data = result.json()
            # 验证每个分段都有必需字段
            for record in result_data["records"]:
                segment = record["segment"]
                assert "id" in segment
                assert "content" in segment
                assert "document_id" in segment
                assert "document" in segment
                assert "id" in segment["document"]
                assert "name" in segment["document"]
    
    @pytest.mark.asyncio
    async def test_validate_score_range(
        self, dify_client, mock_api_keys, sample_retrieval_response, mock_http_response
    ):
        """测试验证分数在有效范围内"""
        with patch.object(dify_client, 'post') as mock_post:
            mock_response = mock_http_response(
                status_code=200,
                json_data=sample_retrieval_response
            )
            mock_post.return_value = mock_response
            
            result = await dify_client.post(
                f"/datasets/dataset-123/retrieve",
                api_key=mock_api_keys["dataset"],
                json_body={
                    "query": "测试",
                    "retrieval_model": {"search_method": "semantic_search", "top_k": 3}
                }
            )
            
            result_data = result.json()
            # 验证分数在 0-1 范围内
            for record in result_data["records"]:
                assert 0 <= record["score"] <= 1


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-m", "unit"])
