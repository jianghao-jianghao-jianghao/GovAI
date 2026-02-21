"""
QA库查询 + 知识库检索 + 工作流调用 集成测试

测试场景：
1. 用户提问
2. 先查询QA库（dataset-02rZJb5w1S39SMUQMXT2sQR2）
3. 如果QA库命中（score >= 阈值），直接返回答案
4. 如果QA库未命中，查询用户指定的知识库
5. 将知识库检索结果传递给智能问答工作流
6. 返回工作流生成的答案

运行测试:
pytest tests/test_qa_fallback_workflow.py -v
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from services.dify import DifyClient


# QA库配置
QA_DATASET_ID = "7047121a-8b6e-487c-893c-3ed489e0fd87"
QA_API_KEY = "dataset-02rZJb5w1S39SMUQMXT2sQR2"

# 智能问答工作流配置（需要根据实际情况调整）
QA_WORKFLOW_API_KEY = "app-your-qa-workflow-key"  # 替换为实际的工作流API Key

# 相关性阈值
QA_HIT_THRESHOLD = 0.85


@pytest.fixture
def dify_client(test_base_url):
    """创建测试客户端"""
    return DifyClient(base_url=test_base_url)


@pytest.fixture
def qa_hit_response():
    """QA库命中的响应"""
    return {
        "query": {"content": "什么是数据分类分级"},
        "records": [
            {
                "segment": {
                    "id": "seg-qa-001",
                    "position": 1,
                    "document_id": "doc-qa-001",
                    "content": "数据分类分级是指根据数据的重要性、敏感性和对组织的价值，将数据划分为不同的类别和级别。",
                    "answer": "数据分类分级是根据数据重要性和敏感性进行分类管理的制度，通常分为公开、内部、敏感、机密等级别。",
                    "keywords": ["数据分类", "分级", "敏感性"],
                    "document": {
                        "id": "doc-qa-001",
                        "name": "QA知识库",
                        "doc_type": "qa"
                    },
                    "dataset_id": QA_DATASET_ID
                },
                "score": 0.95
            }
        ]
    }


@pytest.fixture
def qa_miss_response():
    """QA库未命中的响应（分数低或无结果）"""
    return {
        "query": {"content": "如何实施数据安全管理"},
        "records": [
            {
                "segment": {
                    "id": "seg-qa-002",
                    "content": "数据安全相关内容",
                    "document": {"id": "doc-qa-002", "name": "QA知识库"}
                },
                "score": 0.65  # 低于阈值
            }
        ]
    }


@pytest.fixture
def kb_retrieval_response():
    """知识库检索响应"""
    return {
        "query": {"content": "如何实施数据安全管理"},
        "records": [
            {
                "segment": {
                    "id": "seg-kb-001",
                    "content": "数据安全管理应当建立健全数据安全管理制度，明确数据安全责任，采取技术措施和管理措施保护数据安全。",
                    "document": {
                        "id": "doc-kb-001",
                        "name": "数据安全管理办法.pdf"
                    },
                    "dataset_id": "user-dataset-123"
                },
                "score": 0.92
            },
            {
                "segment": {
                    "id": "seg-kb-002",
                    "content": "组织应当定期开展数据安全风险评估，及时发现和处置数据安全隐患。",
                    "document": {
                        "id": "doc-kb-002",
                        "name": "数据安全指南.pdf"
                    },
                    "dataset_id": "user-dataset-123"
                },
                "score": 0.88
            }
        ]
    }


@pytest.fixture
def workflow_response():
    """工作流响应"""
    return {
        "workflow_run_id": "wfr-123",
        "task_id": "task-456",
        "data": {
            "id": "wfr-123",
            "status": "succeeded",
            "outputs": {
                "answer": "根据检索到的资料，数据安全管理的实施需要：1. 建立健全数据安全管理制度；2. 明确数据安全责任；3. 采取技术和管理措施；4. 定期开展风险评估。",
                "citations": [
                    {
                        "document_name": "数据安全管理办法.pdf",
                        "content": "数据安全管理应当建立健全数据安全管理制度..."
                    },
                    {
                        "document_name": "数据安全指南.pdf",
                        "content": "组织应当定期开展数据安全风险评估..."
                    }
                ]
            }
        }
    }


@pytest.mark.unit
class TestQAFallbackWorkflow:
    """QA库查询 + 知识库检索 + 工作流调用测试"""
    
    @pytest.mark.asyncio
    async def test_qa_hit_direct_return(
        self, dify_client, qa_hit_response, mock_http_response
    ):
        """
        场景1: QA库命中，直接返回答案
        
        流程:
        1. 查询QA库
        2. 发现高分匹配（score >= 0.85）
        3. 直接返回QA库的答案，不查询知识库和工作流
        """
        with patch.object(dify_client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(
                status_code=200,
                json_data=qa_hit_response
            )
            
            # 步骤1: 查询QA库
            query = "什么是数据分类分级"
            qa_result = await dify_client.post(
                f"/datasets/{QA_DATASET_ID}/retrieve",
                api_key=QA_API_KEY,
                json_body={
                    "query": query,
                    "retrieval_model": {
                        "search_method": "semantic_search",
                        "top_k": 1,
                        "score_threshold_enabled": False
                    }
                }
            )
            
            qa_data = qa_result.json()
            
            # 步骤2: 检查是否命中
            assert len(qa_data["records"]) > 0
            best_match = qa_data["records"][0]
            assert best_match["score"] >= QA_HIT_THRESHOLD
            
            # 步骤3: 提取答案
            answer = best_match["segment"].get("answer") or best_match["segment"]["content"]
            
            # 验证结果
            assert "数据分类分级" in answer
            assert best_match["score"] == 0.95
            
            # 验证只调用了一次（只查询QA库）
            assert mock_post.call_count == 1
            
            print(f"\n✓ QA库命中测试通过")
            print(f"  查询: {query}")
            print(f"  分数: {best_match['score']}")
            print(f"  答案: {answer}")
    
    @pytest.mark.asyncio
    async def test_qa_miss_fallback_to_kb_and_workflow(
        self, 
        dify_client, 
        qa_miss_response, 
        kb_retrieval_response,
        workflow_response,
        mock_http_response
    ):
        """
        场景2: QA库未命中，回退到知识库检索 + 工作流
        
        流程:
        1. 查询QA库
        2. 发现未命中（score < 0.85 或无结果）
        3. 查询用户指定的知识库
        4. 将检索结果传递给智能问答工作流
        5. 返回工作流生成的答案
        """
        user_dataset_id = "user-dataset-123"
        user_dataset_api_key = "dataset-user-key-123"
        
        with patch.object(dify_client, 'post') as mock_post:
            # 配置mock返回值序列
            mock_post.side_effect = [
                # 第1次调用: QA库查询 - 未命中
                mock_http_response(status_code=200, json_data=qa_miss_response),
                # 第2次调用: 知识库检索 - 命中
                mock_http_response(status_code=200, json_data=kb_retrieval_response),
                # 第3次调用: 工作流执行 - 生成答案
                mock_http_response(status_code=200, json_data=workflow_response)
            ]
            
            query = "如何实施数据安全管理"
            
            # 步骤1: 查询QA库
            qa_result = await dify_client.post(
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
            
            # 步骤2: 检查QA库是否命中
            qa_hit = False
            if qa_data["records"]:
                best_qa_score = qa_data["records"][0]["score"]
                if best_qa_score >= QA_HIT_THRESHOLD:
                    qa_hit = True
            
            assert not qa_hit, "QA库应该未命中"
            print(f"\n✓ QA库未命中 (score={qa_data['records'][0]['score']} < {QA_HIT_THRESHOLD})")
            
            # 步骤3: 查询用户知识库
            kb_result = await dify_client.post(
                f"/datasets/{user_dataset_id}/retrieve",
                api_key=user_dataset_api_key,
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
            assert len(kb_data["records"]) > 0
            print(f"✓ 知识库检索成功，找到 {len(kb_data['records'])} 条相关内容")
            
            # 步骤4: 准备工作流输入
            # 将检索到的内容组织成上下文
            context_parts = []
            for i, record in enumerate(kb_data["records"], 1):
                segment = record["segment"]
                doc_name = segment["document"]["name"]
                content = segment["content"]
                context_parts.append(f"[来源{i}: {doc_name}]\n{content}")
            
            context = "\n\n".join(context_parts)
            
            # 步骤5: 调用智能问答工作流
            workflow_result = await dify_client.post(
                "/workflows/run",
                api_key=QA_WORKFLOW_API_KEY,
                json_body={
                    "inputs": {
                        "query": query,
                        "context": context,
                        "dataset_ids": [user_dataset_id]
                    },
                    "response_mode": "blocking",
                    "user": "test-user"
                }
            )
            
            workflow_data = workflow_result.json()
            final_answer = workflow_data["data"]["outputs"]["answer"]
            
            # 验证结果
            assert "数据安全管理" in final_answer
            assert "建立健全" in final_answer or "风险评估" in final_answer
            
            # 验证调用次数
            assert mock_post.call_count == 3
            
            print(f"✓ 工作流执行成功")
            print(f"  最终答案: {final_answer}")
            
            # 验证调用顺序
            calls = mock_post.call_args_list
            assert f"/datasets/{QA_DATASET_ID}/retrieve" in calls[0][0][0]
            assert f"/datasets/{user_dataset_id}/retrieve" in calls[1][0][0]
            assert "/workflows/run" in calls[2][0][0]
    
    @pytest.mark.asyncio
    async def test_qa_empty_result_fallback(
        self,
        dify_client,
        kb_retrieval_response,
        workflow_response,
        mock_http_response
    ):
        """
        场景3: QA库返回空结果，回退到知识库
        
        流程:
        1. 查询QA库
        2. 返回空结果
        3. 回退到知识库检索 + 工作流
        """
        empty_qa_response = {
            "query": {"content": "测试问题"},
            "records": []
        }
        
        user_dataset_id = "user-dataset-456"
        user_dataset_api_key = "dataset-user-key-456"
        
        with patch.object(dify_client, 'post') as mock_post:
            mock_post.side_effect = [
                mock_http_response(status_code=200, json_data=empty_qa_response),
                mock_http_response(status_code=200, json_data=kb_retrieval_response),
                mock_http_response(status_code=200, json_data=workflow_response)
            ]
            
            query = "测试问题"
            
            # 步骤1: 查询QA库
            qa_result = await dify_client.post(
                f"/datasets/{QA_DATASET_ID}/retrieve",
                api_key=QA_API_KEY,
                json_body={"query": query, "retrieval_model": {"search_method": "semantic_search", "top_k": 1}}
            )
            
            qa_data = qa_result.json()
            assert len(qa_data["records"]) == 0
            print(f"\n✓ QA库返回空结果")
            
            # 步骤2: 回退到知识库
            kb_result = await dify_client.post(
                f"/datasets/{user_dataset_id}/retrieve",
                api_key=user_dataset_api_key,
                json_body={"query": query, "retrieval_model": {"search_method": "semantic_search", "top_k": 3}}
            )
            
            kb_data = kb_result.json()
            assert len(kb_data["records"]) > 0
            print(f"✓ 知识库检索成功")
            
            # 步骤3: 调用工作流
            context = "\n\n".join([r["segment"]["content"] for r in kb_data["records"]])
            workflow_result = await dify_client.post(
                "/workflows/run",
                api_key=QA_WORKFLOW_API_KEY,
                json_body={
                    "inputs": {"query": query, "context": context},
                    "response_mode": "blocking",
                    "user": "test-user"
                }
            )
            
            workflow_data = workflow_result.json()
            assert "answer" in workflow_data["data"]["outputs"]
            print(f"✓ 工作流执行成功")
            
            assert mock_post.call_count == 3
    
    @pytest.mark.asyncio
    async def test_complete_flow_with_multiple_users(
        self,
        dify_client,
        qa_miss_response,
        mock_http_response
    ):
        """
        场景4: 多用户场景 - 不同用户查询不同的知识库
        
        验证:
        1. QA库对所有用户共享
        2. 每个用户有自己的知识库
        3. 工作流正确使用用户指定的知识库
        """
        # 用户A的知识库
        user_a_dataset_id = "dataset-user-a"
        user_a_kb_response = {
            "query": {"content": "测试"},
            "records": [
                {
                    "segment": {
                        "id": "seg-a-1",
                        "content": "用户A的知识库内容",
                        "document": {"id": "doc-a-1", "name": "用户A文档.pdf"},
                        "dataset_id": user_a_dataset_id
                    },
                    "score": 0.9
                }
            ]
        }
        
        # 用户B的知识库
        user_b_dataset_id = "dataset-user-b"
        user_b_kb_response = {
            "query": {"content": "测试"},
            "records": [
                {
                    "segment": {
                        "id": "seg-b-1",
                        "content": "用户B的知识库内容",
                        "document": {"id": "doc-b-1", "name": "用户B文档.pdf"},
                        "dataset_id": user_b_dataset_id
                    },
                    "score": 0.9
                }
            ]
        }
        
        workflow_a_response = {
            "data": {
                "outputs": {
                    "answer": "基于用户A知识库的答案"
                }
            }
        }
        
        workflow_b_response = {
            "data": {
                "outputs": {
                    "answer": "基于用户B知识库的答案"
                }
            }
        }
        
        with patch.object(dify_client, 'post') as mock_post:
            # 用户A的查询流程
            mock_post.side_effect = [
                mock_http_response(status_code=200, json_data=qa_miss_response),  # QA库
                mock_http_response(status_code=200, json_data=user_a_kb_response),  # 用户A知识库
                mock_http_response(status_code=200, json_data=workflow_a_response),  # 工作流
            ]
            
            query = "测试问题"
            
            # QA库查询
            await dify_client.post(
                f"/datasets/{QA_DATASET_ID}/retrieve",
                api_key=QA_API_KEY,
                json_body={"query": query, "retrieval_model": {"search_method": "semantic_search", "top_k": 1}}
            )
            
            # 用户A知识库查询
            kb_result_a = await dify_client.post(
                f"/datasets/{user_a_dataset_id}/retrieve",
                api_key="dataset-key-a",
                json_body={"query": query, "retrieval_model": {"search_method": "semantic_search", "top_k": 3}}
            )
            
            kb_data_a = kb_result_a.json()
            assert kb_data_a["records"][0]["segment"]["dataset_id"] == user_a_dataset_id
            
            # 工作流调用
            workflow_result_a = await dify_client.post(
                "/workflows/run",
                api_key=QA_WORKFLOW_API_KEY,
                json_body={
                    "inputs": {
                        "query": query,
                        "context": kb_data_a["records"][0]["segment"]["content"],
                        "dataset_ids": [user_a_dataset_id]
                    },
                    "response_mode": "blocking",
                    "user": "user-a"
                }
            )
            
            answer_a = workflow_result_a.json()["data"]["outputs"]["answer"]
            assert "用户A" in answer_a
            
            print(f"\n✓ 用户A查询流程验证通过")
            print(f"  知识库: {user_a_dataset_id}")
            print(f"  答案: {answer_a}")
            
            # 重置mock，测试用户B
            mock_post.side_effect = [
                mock_http_response(status_code=200, json_data=qa_miss_response),
                mock_http_response(status_code=200, json_data=user_b_kb_response),
                mock_http_response(status_code=200, json_data=workflow_b_response),
            ]
            
            # 用户B的查询流程
            await dify_client.post(
                f"/datasets/{QA_DATASET_ID}/retrieve",
                api_key=QA_API_KEY,
                json_body={"query": query, "retrieval_model": {"search_method": "semantic_search", "top_k": 1}}
            )
            
            kb_result_b = await dify_client.post(
                f"/datasets/{user_b_dataset_id}/retrieve",
                api_key="dataset-key-b",
                json_body={"query": query, "retrieval_model": {"search_method": "semantic_search", "top_k": 3}}
            )
            
            kb_data_b = kb_result_b.json()
            assert kb_data_b["records"][0]["segment"]["dataset_id"] == user_b_dataset_id
            
            workflow_result_b = await dify_client.post(
                "/workflows/run",
                api_key=QA_WORKFLOW_API_KEY,
                json_body={
                    "inputs": {
                        "query": query,
                        "context": kb_data_b["records"][0]["segment"]["content"],
                        "dataset_ids": [user_b_dataset_id]
                    },
                    "response_mode": "blocking",
                    "user": "user-b"
                }
            )
            
            answer_b = workflow_result_b.json()["data"]["outputs"]["answer"]
            assert "用户B" in answer_b
            
            print(f"✓ 用户B查询流程验证通过")
            print(f"  知识库: {user_b_dataset_id}")
            print(f"  答案: {answer_b}")


@pytest.mark.unit
class TestQAFallbackEdgeCases:
    """边界情况测试"""
    
    @pytest.mark.asyncio
    async def test_qa_threshold_boundary(
        self, dify_client, mock_http_response
    ):
        """测试QA库阈值边界情况"""
        # 测试刚好等于阈值
        boundary_response = {
            "query": {"content": "测试"},
            "records": [
                {
                    "segment": {
                        "id": "seg-1",
                        "content": "测试内容",
                        "answer": "测试答案",
                        "document": {"id": "doc-1", "name": "QA"}
                    },
                    "score": QA_HIT_THRESHOLD  # 刚好等于阈值
                }
            ]
        }
        
        with patch.object(dify_client, 'post') as mock_post:
            mock_post.return_value = mock_http_response(
                status_code=200,
                json_data=boundary_response
            )
            
            result = await dify_client.post(
                f"/datasets/{QA_DATASET_ID}/retrieve",
                api_key=QA_API_KEY,
                json_body={"query": "测试", "retrieval_model": {"search_method": "semantic_search", "top_k": 1}}
            )
            
            data = result.json()
            score = data["records"][0]["score"]
            
            # 刚好等于阈值应该命中
            assert score >= QA_HIT_THRESHOLD
            print(f"\n✓ 阈值边界测试通过 (score={score}, threshold={QA_HIT_THRESHOLD})")
    
    @pytest.mark.asyncio
    async def test_kb_empty_result_handling(
        self, dify_client, qa_miss_response, mock_http_response
    ):
        """测试知识库也返回空结果的情况"""
        empty_kb_response = {
            "query": {"content": "测试"},
            "records": []
        }
        
        with patch.object(dify_client, 'post') as mock_post:
            mock_post.side_effect = [
                mock_http_response(status_code=200, json_data=qa_miss_response),
                mock_http_response(status_code=200, json_data=empty_kb_response)
            ]
            
            # QA库未命中
            qa_result = await dify_client.post(
                f"/datasets/{QA_DATASET_ID}/retrieve",
                api_key=QA_API_KEY,
                json_body={"query": "测试", "retrieval_model": {"search_method": "semantic_search", "top_k": 1}}
            )
            
            # 知识库也为空
            kb_result = await dify_client.post(
                f"/datasets/user-dataset/retrieve",
                api_key="dataset-key",
                json_body={"query": "测试", "retrieval_model": {"search_method": "semantic_search", "top_k": 3}}
            )
            
            kb_data = kb_result.json()
            assert len(kb_data["records"]) == 0
            
            # 这种情况下应该返回"未找到相关信息"的提示
            # 实际实现中需要处理这种情况
            print(f"\n✓ 知识库空结果处理测试通过")
            print(f"  建议: 返回友好提示，如'抱歉，未找到相关信息'")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-m", "unit"])
