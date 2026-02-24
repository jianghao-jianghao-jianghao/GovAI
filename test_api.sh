#!/bin/bash
# 多模态起草功能完整测试

set -e

echo "=== 1. 登录获取 Token ==="
LOGIN_RESP=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d, indent=2, ensure_ascii=False))" 2>/dev/null || echo "$LOGIN_RESP"

TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('access_token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  exit 1
fi
echo "✅ Token: ${TOKEN:0:20}..."
echo ""

echo "=== 2. 获取公文列表 ==="
DOC_LIST=$(curl -s "http://localhost:8000/api/v1/documents?category=doc&page=1&page_size=5" \
  -H "Authorization: Bearer $TOKEN")

TOTAL=$(echo "$DOC_LIST" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('total',0))" 2>/dev/null)
echo "📋 共 $TOTAL 个公文"

# 找有源文件的文档
DOC_ID=$(echo "$DOC_LIST" | python3 -c "
import sys, json
data = json.load(sys.stdin)
items = data.get('data', {}).get('items', [])
for item in items:
    if item.get('source_format'):
        print(item['id'])
        exit(0)
if items:
    print(items[0]['id'])
" 2>/dev/null)

if [ -z "$DOC_ID" ]; then
  echo "没有公文，创建一个测试公文..."
  CREATE_RESP=$(curl -s -X POST http://localhost:8000/api/v1/documents \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"测试多模态起草","category":"doc","doc_type":"notice","content":"这是一份关于数据安全的参考材料。\n近年来数据安全问题日益突出。"}')
  DOC_ID=$(echo "$CREATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null)
  echo "📄 创建文档: $DOC_ID"
fi

echo "📌 选中文档 ID: $DOC_ID"
echo ""

echo "=== 3. 查看文档详情 ==="
DOC_DETAIL=$(curl -s "http://localhost:8000/api/v1/documents/$DOC_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "$DOC_DETAIL" | python3 -c "
import sys, json
d = json.load(sys.stdin).get('data', {})
print(f'  标题: {d.get(\"title\",\"\")}')
print(f'  类型: {d.get(\"doc_type\",\"\")}')
print(f'  状态: {d.get(\"status\",\"\")}')
print(f'  源文件格式: {d.get(\"source_format\",\"无\")}')
print(f'  内容长度: {len(d.get(\"content\",\"\") or \"\")} 字符')
" 2>/dev/null
echo ""

echo "=== 4. 测试多模态起草（SSE 流式） ==="
echo "📡 发送起草请求..."
echo "---"
curl -s -N -X POST "http://localhost:8000/api/v1/documents/$DOC_ID/ai-process" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stage":"draft","user_instruction":"请帮我起草一份关于加强数据安全管理的通知，包含总体要求、主要任务、保障措施三个部分，主送各下属单位"}' \
  --max-time 180 2>&1
echo ""
echo "---"
echo ""
echo "=== ✅ 测试完成 ==="
