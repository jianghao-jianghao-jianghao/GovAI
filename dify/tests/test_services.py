"""
Dify服务集成测试 (需要真实API Key)

运行测试:
pytest tests/test_services.py -v -m integration
或直接运行:
python tests/test_services.py
"""
import pytest
import asyncio
import os
from dotenv import load_dotenv
from services.dify import create_dify_service

# 加载环境变量
load_dotenv()


@pytest.mark.integration
class TestWorkflowIntegration:
    """工作流服务集成测试"""
    
    @pytest.mark.asyncio
    async def test_doc_draft_integration(self, real_api_keys):
        """测试公文起草 (真实API)"""
        if not real_api_keys["doc_draft"]:
            pytest.skip("未配置 DIFY_APP_DOC_DRAFT_KEY")
        
        dify = create_dify_service(base_url=real_api_keys["base_url"])
        
        result = await dify.workflow.run_doc_draft(
            api_key=real_api_keys["doc_draft"],
            template_content="关于{{主题}}的通知",
            user_requirement="撰写数据安全管理通知",
            user="test_user"
        )
        
        assert result is not None
        assert isinstance(result, dict)
    
    @pytest.mark.asyncio
    async def test_doc_check_integration(self, real_api_keys):
        """测试公文审查 (真实API)"""
        if not real_api_keys["doc_check"]:
            pytest.skip("未配置 DIFY_APP_DOC_CHECK_KEY")
        
        dify = create_dify_service(base_url=real_api_keys["base_url"])
        
        result = await dify.workflow.run_doc_check(
            api_key=real_api_keys["doc_check"],
            content="为了做好数据安全管理工作的开展，特此通知。",
            user="test_user"
        )
        
        assert result is not None
        assert isinstance(result, dict)
    
    @pytest.mark.asyncio
    async def test_entity_extract_integration(self, real_api_keys):
        """测试实体抽取 (真实API)"""
        if not real_api_keys["entity_extract"]:
            pytest.skip("未配置 DIFY_APP_ENTITY_EXTRACT_KEY")
        
        dify = create_dify_service(base_url=real_api_keys["base_url"])
        
        result = await dify.workflow.extract_entities(
            api_key=real_api_keys["entity_extract"],
            text="数据安全法规定，各部门应当加强数据安全保护工作。",
            user="test_user"
        )
        
        assert result is not None
        assert isinstance(result, dict)


@pytest.mark.integration
class TestChatIntegration:
    """聊天服务集成测试"""
    
    @pytest.mark.asyncio
    async def test_rag_chat_integration(self, real_api_keys):
        """测试RAG问答 (真实API)"""
        if not real_api_keys["chat"]:
            pytest.skip("未配置 DIFY_APP_CHAT_KEY")
        
        dify = create_dify_service(base_url=real_api_keys["base_url"])
        
        answer, conv_id, citations = await dify.chat.rag_chat_collect(
            api_key=real_api_keys["chat"],
            query="什么是数据分类分级？",
            user="test_user"
        )
        
        assert isinstance(answer, str)
        assert conv_id is not None


@pytest.mark.integration
class TestDatasetIntegration:
    """数据集服务集成测试"""
    
    @pytest.mark.asyncio
    async def test_dataset_lifecycle(self, real_api_keys):
        """测试知识库完整生命周期 (真实API)"""
        if not real_api_keys["dataset"]:
            pytest.skip("未配置 DIFY_DATASET_API_KEY")
        
        dify = create_dify_service(base_url=real_api_keys["base_url"])
        
        # 创建知识库
        dataset_id = await dify.dataset.create_dataset(
            api_key=real_api_keys["dataset"],
            name="pytest_test_dataset",
            description="自动化测试创建"
        )
        assert dataset_id is not None
        
        try:
            # 上传文档
            test_content = b"This is a test document for pytest."
            result = await dify.dataset.upload_document(
                api_key=real_api_keys["dataset"],
                dataset_id=dataset_id,
                file_bytes=test_content,
                filename="pytest_test.txt",
                content_type="text/plain"
            )
            
            assert "document" in result
            assert "batch" in result
            
            # 查询索引状态
            batch_id = result.get("batch")
            if batch_id:
                status = await dify.dataset.get_indexing_status(
                    api_key=real_api_keys["dataset"],
                    dataset_id=dataset_id,
                    batch=batch_id
                )
                assert "data" in status
        
        finally:
            # 清理: 删除知识库
            await dify.dataset.delete_dataset(
                api_key=real_api_keys["dataset"],
                dataset_id=dataset_id
            )


# 命令行运行脚本
async def test_workflow_service():
    """测试工作流服务"""
    base_url = os.getenv("DIFY_BASE_URL", "https://api.dify.ai/v1")
    doc_draft_key = os.getenv("DIFY_APP_DOC_DRAFT_KEY")
    doc_check_key = os.getenv("DIFY_APP_DOC_CHECK_KEY")
    entity_extract_key = os.getenv("DIFY_APP_ENTITY_EXTRACT_KEY")
    
    if not all([doc_draft_key, doc_check_key, entity_extract_key]):
        print("❌ 错误: 请在 .env 中配置所有必需的 API Key")
        return
    
    print(f"📡 正在连接 Dify: {base_url}")
    dify = create_dify_service(base_url=base_url)
    
    # 测试公文起草
    print("\n🧪 测试公文起草...")
    try:
        result = await dify.workflow.run_doc_draft(
            api_key=doc_draft_key,
            template_content="关于{{主题}}的通知",
            user_requirement="撰写数据安全管理通知",
            user="test_user"
        )
        print("✅ 公文起草成功")
        print(f"结果预览: {str(result)[:200]}...")
    except Exception as e:
        print(f"❌ 公文起草失败: {e}")
    
    # 测试公文审查
    print("\n🧪 测试公文审查...")
    try:
        result = await dify.workflow.run_doc_check(
            api_key=doc_check_key,
            content="为了做好数据安全管理工作的开展，特此通知。",
            user="test_user"
        )
        print("✅ 公文审查成功")
        print(f"结果预览: {str(result)[:200]}...")
    except Exception as e:
        print(f"❌ 公文审查失败: {e}")
    
    # 测试实体抽取
    print("\n🧪 测试实体抽取...")
    try:
        result = await dify.workflow.extract_entities(
            api_key=entity_extract_key,
            text="数据安全法规定，各部门应当加强数据安全保护工作。",
            user="test_user"
        )
        print("✅ 实体抽取成功")
        print(f"结果预览: {str(result)[:200]}...")
    except Exception as e:
        print(f"❌ 实体抽取失败: {e}")


async def test_chat_service():
    """测试聊天服务"""
    base_url = os.getenv("DIFY_BASE_URL", "https://api.dify.ai/v1")
    chat_key = os.getenv("DIFY_APP_CHAT_KEY")
    
    if not chat_key:
        print("❌ 错误: 请在 .env 中配置 DIFY_APP_CHAT_KEY")
        return
    
    print(f"\n📡 正在测试聊天服务: {base_url}")
    dify = create_dify_service(base_url=base_url)
    
    print("\n🧪 测试RAG问答...")
    try:
        answer, conv_id, citations = await dify.chat.rag_chat_collect(
            api_key=chat_key,
            query="什么是数据分类分级？",
            user="test_user"
        )
        print("✅ RAG问答成功")
        print(f"回答: {answer[:200]}...")
        print(f"会话ID: {conv_id}")
        if citations:
            print(f"引用数量: {len(citations)}")
    except Exception as e:
        print(f"❌ RAG问答失败: {e}")


async def test_dataset_service():
    """测试数据集服务"""
    base_url = os.getenv("DIFY_BASE_URL", "https://api.dify.ai/v1")
    dataset_key = os.getenv("DIFY_DATASET_API_KEY")
    
    if not dataset_key:
        print("❌ 错误: 请在 .env 中配置 DIFY_DATASET_API_KEY")
        return
    
    print(f"\n📡 正在测试数据集服务: {base_url}")
    dify = create_dify_service(base_url=base_url)
    
    # 创建测试知识库
    print("\n🧪 测试创建知识库...")
    try:
        dataset_id = await dify.dataset.create_dataset(
            api_key=dataset_key,
            name="测试知识库",
            description="自动化测试创建"
        )
        print(f"✅ 知识库创建成功: {dataset_id}")
        
        # 上传测试文档
        print("\n🧪 测试上传文档...")
        test_content = "这是一个测试文档。数据安全法规定了数据分类分级的要求。".encode('utf-8')
        result = await dify.dataset.upload_document(
            api_key=dataset_key,
            dataset_id=dataset_id,
            file_bytes=test_content,
            filename="test.txt",
            content_type="text/plain"
        )
        print(f"✅ 文档上传成功")
        print(f"文档ID: {result.get('document', {}).get('id')}")
        print(f"批次ID: {result.get('batch')}")
        
        # 查询索引状态
        batch_id = result.get('batch')
        if batch_id:
            print("\n🧪 测试查询索引状态...")
            status_result = await dify.dataset.get_indexing_status(
                api_key=dataset_key,
                dataset_id=dataset_id,
                batch=batch_id
            )
            print(f"✅ 索引状态查询成功")
            print(f"状态: {status_result}")
        
        # 清理测试数据
        print("\n🧹 清理测试数据...")
        await dify.dataset.delete_dataset(
            api_key=dataset_key,
            dataset_id=dataset_id
        )
        print("✅ 测试数据清理完成")
        
    except Exception as e:
        print(f"❌ 数据集操作失败: {e}")


async def main():
    """运行所有测试"""
    print("=" * 60)
    print("Dify 服务集成测试")
    print("=" * 60)
    
    await test_workflow_service()
    await test_chat_service()
    await test_dataset_service()
    
    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
