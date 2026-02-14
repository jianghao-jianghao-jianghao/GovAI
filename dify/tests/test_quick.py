"""
快速测试脚本 - 验证基本功能

运行: python tests/test_quick.py
"""
import asyncio
from services.dify import create_dify_service, DifyClient


async def test_factory():
    """测试服务工厂"""
    print("✓ 测试服务工厂...")
    dify = create_dify_service(base_url="http://test.local/v1")
    
    assert dify is not None
    assert dify.workflow is not None
    assert dify.chat is not None
    assert dify.dataset is not None
    print("  ✅ 服务工厂创建成功")


async def test_client():
    """测试客户端"""
    print("✓ 测试客户端...")
    client = DifyClient(base_url="http://test.local/v1")
    
    assert client is not None
    assert client._base_url == "http://test.local/v1"
    
    headers = client._get_headers("test-key")
    assert headers["Authorization"] == "Bearer test-key"
    print("  ✅ 客户端初始化成功")


async def test_services():
    """测试服务初始化"""
    print("✓ 测试服务初始化...")
    dify = create_dify_service()
    
    # 测试工作流服务
    assert hasattr(dify.workflow, 'run_doc_draft')
    assert hasattr(dify.workflow, 'run_doc_check')
    assert hasattr(dify.workflow, 'run_doc_optimize')
    assert hasattr(dify.workflow, 'extract_entities')
    assert hasattr(dify.workflow, 'run_workflow_streaming')
    print("  ✅ 工作流服务方法完整")
    
    # 测试聊天服务
    assert hasattr(dify.chat, 'rag_chat_stream')
    assert hasattr(dify.chat, 'rag_chat_collect')
    print("  ✅ 聊天服务方法完整")
    
    # 测试数据集服务
    assert hasattr(dify.dataset, 'create_dataset')
    assert hasattr(dify.dataset, 'upload_document')
    assert hasattr(dify.dataset, 'get_indexing_status')
    assert hasattr(dify.dataset, 'delete_document')
    assert hasattr(dify.dataset, 'delete_dataset')
    print("  ✅ 数据集服务方法完整")


async def test_imports():
    """测试导入"""
    print("✓ 测试导入...")
    
    from dify.services.dify import (
        DifyClient,
        DifyError,
        DifyConnectionError,
        DifyTimeoutError,
        DifyRateLimitError,
        DifyStreamError,
        DatasetService,
        WorkflowService,
        ChatService,
        DifyServiceFactory,
        create_dify_service,
    )
    
    print("  ✅ 所有模块导入成功")


async def main():
    """运行所有快速测试"""
    print("=" * 60)
    print("Dify 服务快速测试")
    print("=" * 60)
    print()
    
    try:
        await test_imports()
        await test_factory()
        await test_client()
        await test_services()
        
        print()
        print("=" * 60)
        print("✅ 所有快速测试通过!")
        print("=" * 60)
        return 0
    
    except Exception as e:
        print()
        print("=" * 60)
        print(f"❌ 测试失败: {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
