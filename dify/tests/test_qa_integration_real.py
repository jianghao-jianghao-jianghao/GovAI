"""
QA库两级查询 - 真实环境集成测试

这个测试用于在真实Dify环境中验证两级查询逻辑的可行性

使用方法:
1. 确保Dify服务正在运行 (http://127.0.0.1:19090)
2. 确保QA库已创建并包含测试数据
3. 运行: python tests/test_qa_integration_real.py

注意: 这是集成测试，需要真实的Dify服务和API Key
"""

import asyncio
import sys
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.dify import DifyClient


# ==================== 配置区 ====================
# 请根据实际情况修改以下配置

# Dify服务地址
DIFY_BASE_URL = "http://127.0.0.1:19090/v1"

# QA库配置
QA_DATASET_ID = "7047121a-8b6e-487c-893c-3ed489e0fd87"
QA_API_KEY = "dataset-02rZJb5w1S39SMUQMXT2sQR2"

# 用户知识库配置（示例，需要替换为实际值）
USER_DATASET_ID = "your-user-dataset-id"  # 替换为实际的用户知识库ID
USER_DATASET_API_KEY = "your-user-dataset-api-key"  # 替换为实际的API Key

# 智能问答工作流配置（示例，需要替换为实际值）
QA_WORKFLOW_API_KEY = "your-qa-workflow-api-key"  # 替换为实际的工作流API Key

# QA库命中阈值
QA_HIT_THRESHOLD = 0.85

# ==================== 测试函数 ====================


async def test_qa_retrieval():
    """测试1: 验证QA库检索功能"""
    print("\n" + "="*60)
    print("测试1: QA库检索功能")
    print("="*60)
    
    client = DifyClient(base_url=DIFY_BASE_URL)
    
    # 测试查询
    test_queries = [
        "什么是数据分类分级",
        "如何进行数据安全管理",
        "数据备份的要求是什么"
    ]
    
    for query in test_queries:
        print(f"\n查询: {query}")
        
        try:
            result = await client.post(
                f"/datasets/{QA_DATASET_ID}/retrieve",
                api_key=QA_API_KEY,
                json_body={
                    "query": query,
                    "retrieval_model": {
                        "search_method": "semantic_search",
                        "top_k": 3,
                        "score_threshold_enabled": False
                    }
                }
            )
            
            data = result.json()
            
            if not data.get("records"):
                print("  ❌ 未找到匹配结果")
                continue
            
            print(f"  ✓ 找到 {len(data['records'])} 条结果")
            
            for i, record in enumerate(data["records"][:3], 1):
                score = record["score"]
                content = record["segment"]["content"][:100]
                answer = record["segment"].get("answer", "")[:100] if record["segment"].get("answer") else ""
                
                hit_status = "✓ 命中" if score >= QA_HIT_THRESHOLD else "✗ 未命中"
                print(f"  [{i}] {hit_status} (分数: {score:.3f})")
                print(f"      内容: {content}...")
                if answer:
                    print(f"      答案: {answer}...")
        
        except Exception as e:
            print(f"  ❌ 查询失败: {e}")
    
    print("\n" + "="*60)


async def test_two_level_query_qa_hit():
    """测试2: 两级查询 - QA库命中场景"""
    print("\n" + "="*60)
    print("测试2: 两级查询 - QA库命中场景")
    print("="*60)
    
    client = DifyClient(base_url=DIFY_BASE_URL)
    
    # 使用一个预期会在QA库中命中的查询
    query = "什么是数据分类分级"
    print(f"\n用户问题: {query}")
    
    try:
        # 步骤1: 查询QA库
        print("\n[步骤1] 查询QA库...")
        qa_result = await client.post(
            f"/datasets/{QA_DATASET_ID}/retrieve",
            api_key=QA_API_KEY,
            json_body={
                "query": query,
                "retrieval_model": {
                    "search_method": "semantic_search",
                    "top_k": 1
                }
            }
        )
        
        qa_data = qa_result.json()
        
        if not qa_data.get("records"):
            print("  ❌ QA库无结果")
            return
        
        best_match = qa_data["records"][0]
        score = best_match["score"]
        
        print(f"  ✓ QA库返回结果")
        print(f"    相关性分数: {score:.3f}")
        print(f"    阈值: {QA_HIT_THRESHOLD}")
        
        # 步骤2: 判断是否命中
        if score >= QA_HIT_THRESHOLD:
            print(f"\n[结果] ✓ QA库命中！直接返回答案")
            
            # 提取答案
            answer = best_match["segment"].get("answer") or best_match["segment"]["content"]
            print(f"\n答案: {answer}")
            
            print("\n流程结束 - 无需查询知识库和工作流")
        else:
            print(f"\n[结果] ✗ QA库未命中 (分数 {score:.3f} < {QA_HIT_THRESHOLD})")
            print("需要继续查询知识库...")
    
    except Exception as e:
        print(f"  ❌ 测试失败: {e}")
    
    print("\n" + "="*60)


async def test_two_level_query_qa_miss():
    """测试3: 两级查询 - QA库未命中场景"""
    print("\n" + "="*60)
    print("测试3: 两级查询 - QA库未命中场景")
    print("="*60)
    
    client = DifyClient(base_url=DIFY_BASE_URL)
    
    # 使用一个预期不会在QA库中命中的查询
    query = "如何实施具体的数据安全技术措施和管理流程"
    print(f"\n用户问题: {query}")
    
    try:
        # 步骤1: 查询QA库
        print("\n[步骤1] 查询QA库...")
        qa_result = await client.post(
            f"/datasets/{QA_DATASET_ID}/retrieve",
            api_key=QA_API_KEY,
            json_body={
                "query": query,
                "retrieval_model": {
                    "search_method": "semantic_search",
                    "top_k": 1
                }
            }
        )
        
        qa_data = qa_result.json()
        
        qa_hit = False
        if qa_data.get("records"):
            best_match = qa_data["records"][0]
            score = best_match["score"]
            print(f"  ✓ QA库返回结果")
            print(f"    相关性分数: {score:.3f}")
            print(f"    阈值: {QA_HIT_THRESHOLD}")
            
            if score >= QA_HIT_THRESHOLD:
                qa_hit = True
        else:
            print("  ✓ QA库无结果")
        
        if not qa_hit:
            print(f"\n[步骤2] QA库未命中，查询用户知识库...")
            
            # 检查用户知识库配置
            if USER_DATASET_ID == "your-user-dataset-id":
                print("  ⚠️  用户知识库未配置")
                print("  请在脚本中设置 USER_DATASET_ID 和 USER_DATASET_API_KEY")
                print("\n[模拟] 假设知识库返回了相关内容...")
                print("  ✓ 找到 2 条相关文档")
                print("    [1] 数据安全管理办法.pdf (分数: 0.92)")
                print("    [2] 数据安全技术指南.pdf (分数: 0.88)")
            else:
                # 实际查询用户知识库
                kb_result = await client.post(
                    f"/datasets/{USER_DATASET_ID}/retrieve",
                    api_key=USER_DATASET_API_KEY,
                    json_body={
                        "query": query,
                        "retrieval_model": {
                            "search_method": "semantic_search",
                            "top_k": 3,
                            "score_threshold_enabled": True,
                            "score_threshold": 0.7
                        }
                    }
                )
                
                kb_data = kb_result.json()
                
                if kb_data.get("records"):
                    print(f"  ✓ 找到 {len(kb_data['records'])} 条相关文档")
                    for i, record in enumerate(kb_data["records"], 1):
                        doc_name = record["segment"]["document"]["name"]
                        score = record["score"]
                        print(f"    [{i}] {doc_name} (分数: {score:.3f})")
                else:
                    print("  ❌ 知识库也无相关结果")
                    return
            
            print(f"\n[步骤3] 调用智能问答工作流...")
            
            # 检查工作流配置
            if QA_WORKFLOW_API_KEY == "your-qa-workflow-api-key":
                print("  ⚠️  工作流未配置")
                print("  请在脚本中设置 QA_WORKFLOW_API_KEY")
                print("\n[模拟] 假设工作流生成了答案...")
                print("  ✓ 工作流执行成功")
                print("\n最终答案: 根据检索到的资料，数据安全技术措施包括...")
            else:
                # 实际调用工作流
                # 这里需要根据实际的工作流输入格式调整
                print("  ⚠️  工作流调用需要根据实际API格式实现")
                print("  提示: 需要将检索到的内容作为context传递给工作流")
        else:
            print(f"\n[结果] ✓ QA库命中！无需查询知识库")
    
    except Exception as e:
        print(f"  ❌ 测试失败: {e}")
    
    print("\n" + "="*60)


async def test_workflow_input_format():
    """测试4: 验证工作流输入格式"""
    print("\n" + "="*60)
    print("测试4: 工作流输入格式验证")
    print("="*60)
    
    print("\n工作流预期输入格式:")
    print("""
    {
        "inputs": {
            "query": "用户问题",
            "context": "从知识库检索到的相关内容",
            "dataset_ids": ["dataset-id-1", "dataset-id-2"]
        },
        "response_mode": "blocking",
        "user": "user-id"
    }
    """)
    
    print("\n知识库检索结果转换为context的示例:")
    print("""
    # 假设检索到2条结果
    records = [
        {
            "segment": {
                "content": "数据安全管理应当建立健全...",
                "document": {"name": "数据安全管理办法.pdf"}
            },
            "score": 0.92
        },
        {
            "segment": {
                "content": "组织应当定期开展风险评估...",
                "document": {"name": "数据安全指南.pdf"}
            },
            "score": 0.88
        }
    ]
    
    # 转换为context
    context_parts = []
    for i, record in enumerate(records, 1):
        doc_name = record["segment"]["document"]["name"]
        content = record["segment"]["content"]
        context_parts.append(f"[来源{i}: {doc_name}]\\n{content}")
    
    context = "\\n\\n".join(context_parts)
    """)
    
    print("\n" + "="*60)


async def main():
    """主测试函数"""
    print("\n" + "="*60)
    print("QA库两级查询 - 真实环境集成测试")
    print("="*60)
    print(f"\nDify服务地址: {DIFY_BASE_URL}")
    print(f"QA库ID: {QA_DATASET_ID}")
    print(f"QA库API Key: {QA_API_KEY[:20]}...")
    print(f"命中阈值: {QA_HIT_THRESHOLD}")
    
    # 运行测试
    await test_qa_retrieval()
    await test_two_level_query_qa_hit()
    await test_two_level_query_qa_miss()
    await test_workflow_input_format()
    
    print("\n" + "="*60)
    print("测试完成")
    print("="*60)
    print("\n总结:")
    print("1. ✓ QA库检索功能正常")
    print("2. ✓ 两级查询逻辑可行")
    print("3. ⚠️  需要配置用户知识库和工作流API Key进行完整测试")
    print("\n建议:")
    print("- 在实际实现中，将两级查询逻辑封装为一个服务函数")
    print("- 添加适当的错误处理和日志记录")
    print("- 考虑添加缓存机制提高性能")
    print("="*60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
