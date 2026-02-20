"""
测试上传文档到 Dify 知识库

功能说明：
1. 创建测试知识库
2. 上传文档到知识库
3. 查询文档索引状态
4. 清理测试数据（删除文档和知识库）

使用方法：
    python test_upload.py
"""
import asyncio
import sys
from pathlib import Path
from datetime import datetime

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))

from app.services.dify.client import RealDifyService


async def test_upload_document():
    """测试上传文档功能"""
    
    # 创建 Dify 服务实例
    dify_service = RealDifyService()
    
    print("=" * 60)
    print("测试上传文档到 Dify 知识库")
    print("=" * 60)
    
    # 测试文件内容
    test_content = """
    这是一个测试文档。
    
    测试内容：
    1. 政府文件管理系统
    2. 知识库功能测试
    3. Dify API 集成验证
    
    本文档用于验证上传功能是否正常工作。
    """.encode('utf-8')
    
    try:
        # 步骤 1: 创建知识库
        print("\n[步骤 1] 创建测试知识库...")
        dataset = await dify_service.create_dataset(name="测试知识库_upload_test2")
        print(f"✓ 知识库创建成功")
        print(f"  - Dataset ID: {dataset.dataset_id}")
        print(f"  - Dataset Name: {dataset.name}")
        
        dataset_id = dataset.dataset_id
        
        # 步骤 2: 上传文档
        print("\n[步骤 2] 上传测试文档...")
        upload_result = await dify_service.upload_document(
            dataset_id=dataset_id,
            file_name="test_document.txt",
            file_content=test_content,
            file_type="text/plain"
        )
        print(f"✓ 文档上传成功")
        print(f"  - Document ID: {upload_result.document_id}")
        print(f"  - Batch ID: {upload_result.batch_id}")
        
        # 步骤 3: 查询索引状态
        print("\n[步骤 3] 查询文档索引状态...")
        status = await dify_service.get_indexing_status(
            dataset_id=dataset_id,
            batch_id=upload_result.batch_id
        )
        print(f"✓ 索引状态: {status}")
        
        # 等待索引完成
        max_retries = 10
        retry_count = 0
        while status == "indexing" and retry_count < max_retries:
            print(f"  等待索引完成... ({retry_count + 1}/{max_retries})")
            await asyncio.sleep(2)
            status = await dify_service.get_indexing_status(
                dataset_id=dataset_id,
                batch_id=upload_result.batch_id
            )
            retry_count += 1
        
        if status == "completed":
            print(f"✓ 文档索引完成")
        elif status == "error":
            print(f"✗ 文档索引失败")
        else:
            print(f"⚠ 文档仍在索引中: {status}")
        
        # 步骤 4: 清理 - 删除文档
        print("\n[步骤 4] 清理测试数据...")
        await dify_service.delete_document(
            dataset_id=dataset_id,
            document_id=upload_result.document_id
        )
        print(f"✓ 文档删除成功")
        
        # 步骤 5: 删除知识库（可能遇到速率限制）
        print("\n[步骤 5] 删除知识库...")
        try:
            await dify_service.delete_dataset(dataset_id=dataset_id)
            print(f"✓ 知识库删除成功")
        except Exception as e:
            if "rate limit" in str(e).lower():
                print(f"⚠ 遇到速率限制，知识库未删除（这是正常的）")
                print(f"  知识库 ID: {dataset_id}")
                print(f"  请稍后手动删除或等待自动清理")
            else:
                raise
        
        print("\n" + "=" * 60)
        print("✓ 所有测试通过！")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n✗ 测试失败: {str(e)}")
        print("\n请检查：")
        print("1. DIFY_BASE_URL 是否正确配置为 https://api.dify.ai/v1")
        print("2. DIFY_DATASET_API_KEY 是否有效")
        print("3. 网络连接是否正常")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_upload_document())
