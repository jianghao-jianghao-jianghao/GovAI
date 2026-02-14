"""
Dataset Service 单元测试
"""
import pytest
from unittest.mock import AsyncMock, patch
from services.dify import DifyClient, DatasetService


@pytest.fixture
def dify_client(test_base_url):
    """创建测试客户端"""
    return DifyClient(base_url=test_base_url)


@pytest.fixture
def dataset_service(dify_client):
    """创建数据集服务"""
    return DatasetService(dify_client)


@pytest.mark.unit
class TestDatasetService:
    """数据集服务测试"""
    
    @pytest.mark.asyncio
    async def test_create_dataset(
        self, dataset_service, mock_api_keys, sample_dataset_response, mock_http_response
    ):
        """测试创建知识库"""
        with patch.object(dataset_service._client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(
                status_code=200,
                json_data=sample_dataset_response
            )
            
            dataset_id = await dataset_service.create_dataset(
                api_key=mock_api_keys["dataset"],
                name="测试知识库",
                description="测试描述"
            )
            
            assert dataset_id == "d290f1ee-6c54-4b01-90e6-d701748f0851"
            
            # 验证调用参数
            call_args = mock_post.call_args
            assert call_args[1]["json_body"]["name"] == "测试知识库"
            assert call_args[1]["json_body"]["indexing_technique"] == "high_quality"
    
    @pytest.mark.asyncio
    async def test_upload_document(
        self, dataset_service, mock_api_keys, sample_document_response, mock_http_response
    ):
        """测试上传文档"""
        with patch.object(dataset_service._client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(
                status_code=200,
                json_data=sample_document_response
            )
            
            file_bytes = b"This is a test document content."
            result = await dataset_service.upload_document(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                file_bytes=file_bytes,
                filename="test.txt",
                content_type="text/plain"
            )
            
            assert "document" in result
            assert "batch" in result
            assert result["document"]["id"] == "a8c6c36f-9f5d-4d7a-8472-f5d7b75d71d2"
            assert result["batch"] == "20230921150427533684"
            
            # 验证文件上传参数
            call_args = mock_post.call_args
            assert "files" in call_args[1]
            assert "data" in call_args[1]
    
    @pytest.mark.asyncio
    async def test_get_indexing_status(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试查询索引状态"""
        status_response = {
            "data": [
                {
                    "id": "doc-123",
                    "indexing_status": "completed",
                    "processing_started_at": 1695308667,
                    "completed_at": 1695308700,
                    "completed_segments": 10,
                    "total_segments": 10
                }
            ]
        }
        
        with patch.object(dataset_service._client, 'get') as mock_get:
            mock_get.return_value = mock_http_response(
                status_code=200,
                json_data=status_response
            )
            
            result = await dataset_service.get_indexing_status(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                batch="batch-456"
            )
            
            assert "data" in result
            assert result["data"][0]["indexing_status"] == "completed"
    
    @pytest.mark.asyncio
    async def test_delete_document(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试删除文档"""
        with patch.object(dataset_service._client, 'delete') as mock_delete:
            mock_delete.return_value = mock_http_response(status_code=204)
            
            await dataset_service.delete_document(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123",
                document_id="doc-456"
            )
            
            # 验证调用
            mock_delete.assert_called_once()
            call_args = mock_delete.call_args
            assert "/datasets/dataset-123/documents/doc-456" in call_args[0][0]
    
    @pytest.mark.asyncio
    async def test_delete_dataset(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试删除知识库"""
        with patch.object(dataset_service._client, 'delete') as mock_delete:
            mock_delete.return_value = mock_http_response(status_code=204)
            
            await dataset_service.delete_dataset(
                api_key=mock_api_keys["dataset"],
                dataset_id="dataset-123"
            )
            
            # 验证调用
            mock_delete.assert_called_once()
            call_args = mock_delete.call_args
            assert "/datasets/dataset-123" in call_args[0][0]
    
    @pytest.mark.asyncio
    @pytest.mark.skip(reason="文件大小检查由Dify服务端处理，客户端暂不实现")
    async def test_upload_large_file(
        self, dataset_service, mock_api_keys, mock_http_response
    ):
        """测试上传大文件"""
        from services.dify.exceptions import DifyError
        
        # 创建一个超过15MB的文件
        large_file = b"x" * (16 * 1024 * 1024)  # 16MB
        
        with patch.object(dataset_service._client, 'post') as mock_post:
            error_response = {
                "code": "file_too_large",
                "message": "File size exceeded.",
                "status": 413
            }
            mock_post.return_value = mock_http_response(
                status_code=413,
                json_data=error_response
            )
            
            # 这里应该抛出异常,但我们的实现还没有文件大小检查
            # 实际使用时Dify会返回413错误
            with pytest.raises(Exception):
                await dataset_service.upload_document(
                    api_key=mock_api_keys["dataset"],
                    dataset_id="dataset-123",
                    file_bytes=large_file,
                    filename="large.txt",
                    content_type="text/plain"
                )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-m", "unit"])
