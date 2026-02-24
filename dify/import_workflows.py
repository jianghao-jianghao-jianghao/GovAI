"""
Dify DSL 工作流导入脚本

功能：
  1. 读取 workflows_dsl/ 目录下的 YAML 文件
  2. 通过 Dify API 批量导入为应用
  3. 支持更新已有同名应用

使用方法：
  python import_workflows.py --base-url http://localhost/v1 --token <admin_token>

环境变量方式：
  export DIFY_BASE_URL=http://localhost/v1
  export DIFY_ADMIN_TOKEN=<admin_token>
  python import_workflows.py
"""

import argparse
import json
import os
import sys
from pathlib import Path

import yaml

try:
    import requests
except ImportError:
    print("请先安装 requests: pip install requests")
    sys.exit(1)


# DSL 文件目录
DSL_DIR = Path(__file__).parent / "workflows_dsl"

# 要导入的工作流列表
WORKFLOWS = [
    "智能公文起草.yml",
    "智能公文审查.yml",
    "智能公文优化.yml",
    "智能文档排版.yml",
    "智能格式诊断.yml",
    "智能标点修复.yml",
    "实体与关系抽取.yml",
    "智能知识问答（后端检索版）.yml",
]


def load_dsl(file_path: Path) -> dict:
    """读取 YAML DSL 文件"""
    with open(file_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def dsl_to_json(dsl: dict) -> str:
    """将 DSL 字典转为 JSON 字符串（Dify 导入格式）"""
    return json.dumps(dsl, ensure_ascii=False, indent=2)


def list_apps(base_url: str, token: str) -> list[dict]:
    """列出所有 Dify 应用"""
    url = f"{base_url}/apps"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(url, headers=headers, params={"limit": 100})
    resp.raise_for_status()
    return resp.json().get("data", [])


def import_dsl_via_api(base_url: str, token: str, dsl_content: str, name: str) -> dict:
    """
    通过 Dify API 导入 DSL。

    Dify 支持两种导入方式：
    1. POST /apps/import  — 从 DSL YAML/JSON 导入
    2. Web UI 导入 — 设置 → 导入 DSL

    本函数使用 API 方式。
    """
    url = f"{base_url}/apps/import"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {
        "data": dsl_content,
        "name": name,
        "mode": "yaml-dsl",  # 或 "json-dsl"
    }
    resp = requests.post(url, headers=headers, json=payload)
    resp.raise_for_status()
    return resp.json()


def export_as_json(output_dir: Path):
    """
    将所有 YAML DSL 文件转为 JSON 格式导出。
    用户可以在 Dify Web UI 中手动导入这些 JSON 文件。
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    
    for filename in WORKFLOWS:
        yaml_path = DSL_DIR / filename
        if not yaml_path.exists():
            print(f"  ⚠️  跳过 {filename}（文件不存在）")
            continue
        
        dsl = load_dsl(yaml_path)
        json_path = output_dir / filename.replace(".yml", ".json")
        
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(dsl, f, ensure_ascii=False, indent=2)
        
        print(f"  ✅ {filename} → {json_path.name}")
    
    print(f"\n导出完成！JSON 文件位于: {output_dir}")
    print("在 Dify 控制台中：创建应用 → 导入 DSL → 选择 JSON 文件即可")


def print_structured_output_schemas():
    """打印结构化输出 JSON Schema，供手动配置 Dify 结构化输出功能使用"""
    schema_file = DSL_DIR / "structured_output_schemas.json"
    if not schema_file.exists():
        print("⚠️  未找到 structured_output_schemas.json")
        return
    
    with open(schema_file, "r", encoding="utf-8") as f:
        schemas = json.load(f)
    
    print("\n" + "=" * 60)
    print("Dify 强制结构化输出 JSON Schema")
    print("=" * 60)
    print("\n在 Dify LLM 节点中启用「结构化输出」后，")
    print("将以下 Schema 粘贴到对应工作流的 JSON Schema 配置中：\n")
    
    for key, value in schemas.items():
        print(f"\n{'─' * 40}")
        print(f"📋 {value['name']} ({key})")
        print(f"   {value['description']}")
        print(f"{'─' * 40}")
        print(json.dumps(value["schema"], ensure_ascii=False, indent=2))
        print()


def main():
    parser = argparse.ArgumentParser(description="Dify DSL 工作流导入工具")
    parser.add_argument("--base-url", default=os.environ.get("DIFY_BASE_URL", ""),
                        help="Dify API 基地址（如 http://localhost/v1）")
    parser.add_argument("--token", default=os.environ.get("DIFY_ADMIN_TOKEN", ""),
                        help="Dify 管理员 Token")
    parser.add_argument("--export-json", action="store_true",
                        help="仅导出为 JSON 文件（不调用 API）")
    parser.add_argument("--output-dir", default="workflows_json",
                        help="JSON 导出目录（默认 workflows_json）")
    parser.add_argument("--show-schemas", action="store_true",
                        help="显示结构化输出 JSON Schema")
    args = parser.parse_args()

    if args.show_schemas:
        print_structured_output_schemas()
        return

    if args.export_json:
        print("📦 导出 DSL 为 JSON 格式...\n")
        export_as_json(Path(args.output_dir))
        print_structured_output_schemas()
        return

    if not args.base_url or not args.token:
        print("❌ 请提供 --base-url 和 --token 参数，或设置环境变量 DIFY_BASE_URL / DIFY_ADMIN_TOKEN")
        print("\n💡 或使用 --export-json 模式导出为 JSON 文件后在 Dify Web UI 中手动导入")
        parser.print_help()
        sys.exit(1)

    print(f"🔗 Dify API: {args.base_url}")
    print(f"📂 DSL 目录: {DSL_DIR}\n")

    success = 0
    failed = 0

    for filename in WORKFLOWS:
        yaml_path = DSL_DIR / filename
        if not yaml_path.exists():
            print(f"  ⚠️  跳过 {filename}（文件不存在）")
            continue

        dsl = load_dsl(yaml_path)
        app_name = dsl.get("app", {}).get("name", filename)
        dsl_yaml = yaml_path.read_text(encoding="utf-8")

        print(f"  📤 导入 {app_name}...", end=" ")
        try:
            result = import_dsl_via_api(args.base_url, args.token, dsl_yaml, app_name)
            print(f"✅ 成功 (app_id: {result.get('app_id', 'N/A')})")
            success += 1
        except requests.HTTPError as e:
            print(f"❌ 失败: {e.response.text[:200]}")
            failed += 1
        except Exception as e:
            print(f"❌ 失败: {e}")
            failed += 1

    print(f"\n{'=' * 40}")
    print(f"导入完成: ✅ {success} 成功, ❌ {failed} 失败")

    if success > 0:
        print("\n⚠️  导入后请在 Dify 控制台中：")
        print("   1. 为每个应用生成 API Key")
        print("   2. 在 LLM 节点中开启「结构化输出」并粘贴对应的 JSON Schema")
        print("   3. 将 API Key 配置到后端 .env 文件中")
        print_structured_output_schemas()


if __name__ == "__main__":
    main()
