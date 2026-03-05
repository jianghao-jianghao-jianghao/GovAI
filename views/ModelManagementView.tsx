import React, { useState, useEffect, useCallback } from "react";
import {
  Cpu,
  Plus,
  Edit2,
  Trash2,
  Zap,
  Search,
  Loader2,
  Server,
  Cloud,
  ToggleLeft,
  ToggleRight,
  Star,
  Info,
  CheckCircle,
  XCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Settings2,
} from "lucide-react";
import {
  apiListModels,
  apiCreateModel,
  apiUpdateModel,
  apiDeleteModel,
  apiTestModelConnection,
  apiGetParamInfo,
  type LLMModelItem,
  type LLMModelForm,
  type ParamInfo,
} from "../api";
import { Modal, useConfirm } from "../components/ui";

/* ── 常量 ── */
const MODEL_TYPES = [
  { value: "text_generation", label: "文本生成", color: "bg-blue-100 text-blue-700" },
  { value: "semantic_understanding", label: "语义理解", color: "bg-purple-100 text-purple-700" },
  { value: "knowledge_qa", label: "知识问答", color: "bg-green-100 text-green-700" },
  { value: "embedding", label: "向量嵌入", color: "bg-amber-100 text-amber-700" },
  { value: "other", label: "其他", color: "bg-gray-100 text-gray-700" },
];

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "azure", label: "Azure OpenAI" },
  { value: "ollama", label: "Ollama (本地)" },
  { value: "vllm", label: "vLLM (本地)" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "zhipu", label: "智谱AI" },
  { value: "qwen", label: "通义千问" },
  { value: "baidu", label: "百度文心" },
  { value: "custom", label: "自定义" },
];

const DEPLOYMENTS = [
  { value: "local", label: "本地部署", icon: Server },
  { value: "remote", label: "远端服务", icon: Cloud },
];

const emptyForm: LLMModelForm = {
  name: "",
  provider: "openai",
  model_id: "",
  model_type: "text_generation",
  deployment: "remote",
  endpoint_url: "",
  api_key: "",
  temperature: 0.7,
  max_tokens: 2048,
  top_p: 0.9,
  top_k: 50,
  frequency_penalty: 0.0,
  presence_penalty: 0.0,
  is_active: true,
  is_default: false,
  description: "",
};

/* ── 主视图 ── */
export const ModelManagementView = ({ toast, currentUser }: { toast: any; currentUser: any }) => {
  const [models, setModels] = useState<LLMModelItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("");
  const [filterDeployment, setFilterDeployment] = useState("");
  const [keyword, setKeyword] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LLMModelForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const [paramInfo, setParamInfo] = useState<ParamInfo[]>([]);
  const [showParams, setShowParams] = useState(false);

  const { confirm, ConfirmDialog } = useConfirm() as any;

  /* 加载模型列表 */
  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (filterType) filters.model_type = filterType;
      if (filterDeployment) filters.deployment = filterDeployment;
      if (keyword) filters.keyword = keyword;
      const data = await apiListModels(page, 50, Object.keys(filters).length > 0 ? filters : undefined);
      setModels(data.items);
      setTotal(data.total);
    } catch (err: any) {
      toast.error("加载模型列表失败: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filterType, filterDeployment, keyword]);

  useEffect(() => { loadModels(); }, [loadModels]);

  /* 加载参数说明 */
  useEffect(() => {
    apiGetParamInfo().then(setParamInfo).catch(() => {});
  }, []);

  /* 打开新建/编辑 */
  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowParams(false);
    setShowForm(true);
  };

  const openEdit = (m: LLMModelItem) => {
    setEditingId(m.id);
    setForm({
      name: m.name,
      provider: m.provider,
      model_id: m.model_id,
      model_type: m.model_type,
      deployment: m.deployment,
      endpoint_url: m.endpoint_url,
      api_key: "",
      temperature: m.temperature,
      max_tokens: m.max_tokens,
      top_p: m.top_p,
      top_k: m.top_k,
      frequency_penalty: m.frequency_penalty,
      presence_penalty: m.presence_penalty,
      is_active: m.is_active,
      is_default: m.is_default,
      description: m.description || "",
    });
    setShowParams(false);
    setShowForm(true);
  };

  /* 保存 */
  const handleSave = async () => {
    if (!form.name || !form.model_id || !form.endpoint_url) {
      toast.error("请填写必要字段：名称、模型标识、端点地址");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await apiUpdateModel(editingId, form);
        toast.success("模型更新成功");
      } else {
        await apiCreateModel(form);
        toast.success("模型创建成功");
      }
      setShowForm(false);
      loadModels();
    } catch (err: any) {
      toast.error("保存失败: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  /* 删除 */
  const handleDelete = async (m: LLMModelItem) => {
    const ok = await confirm({
      title: "删除模型",
      message: `确认删除模型「${m.name}」？此操作不可恢复。`,
      variant: "danger",
      confirmText: "删除",
    });
    if (!ok) return;
    try {
      await apiDeleteModel(m.id);
      toast.success("删除成功");
      loadModels();
    } catch (err: any) {
      toast.error("删除失败: " + err.message);
    }
  };

  /* 连通性测试 */
  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const result = await apiTestModelConnection(id);
      toast.success(`连接成功，响应耗时 ${result.response_time_ms}ms`);
    } catch (err: any) {
      toast.error("连接测试失败: " + err.message);
    } finally {
      setTesting(null);
    }
  };

  const typeInfo = (t: string) => MODEL_TYPES.find((x) => x.value === t) || MODEL_TYPES[4];

  /* 参数滑块组件 */
  const ParamSlider = ({ paramKey, value, onChange }: { paramKey: string; value: number; onChange: (v: number) => void }) => {
    const info = paramInfo.find((p) => p.key === paramKey);
    if (!info) return null;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-gray-700">{info.label}</label>
            <div className="group relative">
              <HelpCircle size={13} className="text-gray-400 cursor-help" />
              <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
                <p className="mb-2">{info.description}</p>
                <p className="text-yellow-300">💡 {info.tips}</p>
                <p className="text-gray-400 mt-1">推荐值: {info.recommended}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="w-20 text-xs border rounded px-2 py-1 text-right"
              value={value}
              min={info.min}
              max={info.max}
              step={info.step}
              onChange={(e) => onChange(parseFloat(e.target.value) || info.default)}
            />
            <button
              onClick={() => onChange(info.recommended)}
              className="text-[10px] text-blue-500 hover:text-blue-700 whitespace-nowrap"
              title="重置为推荐值"
            >
              推荐值
            </button>
          </div>
        </div>
        <input
          type="range"
          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          min={info.min}
          max={info.max}
          step={info.step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <div className="flex justify-between text-[10px] text-gray-400">
          <span>{info.min}</span>
          <span>{info.max}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200">
      {/* 顶部工具栏 */}
      <div className="p-4 border-b bg-gray-50 flex flex-wrap gap-4 items-center justify-between">
        <div className="font-bold text-gray-700 flex items-center">
          <Cpu size={18} className="mr-2" /> 模型管理
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex items-center space-x-2 bg-white border rounded-md px-2 py-1 shadow-sm">
            <Search size={14} className="text-gray-400" />
            <input
              className="text-xs outline-none w-28 bg-transparent"
              placeholder="搜索模型..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <select
            className="text-xs border rounded-md px-2 py-1.5 bg-white shadow-sm"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">全部用途</option>
            {MODEL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            className="text-xs border rounded-md px-2 py-1.5 bg-white shadow-sm"
            value={filterDeployment}
            onChange={(e) => setFilterDeployment(e.target.value)}
          >
            <option value="">全部部署方式</option>
            {DEPLOYMENTS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <button
            onClick={openCreate}
            className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded flex items-center transition-colors shadow-sm"
          >
            <Plus size={14} className="mr-1" /> 接入模型
          </button>
        </div>
      </div>

      {/* 模型列表 */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-blue-500" size={28} />
          </div>
        ) : models.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Cpu size={48} className="mb-4 text-gray-300" />
            <p className="text-sm">暂无已接入的模型</p>
            <button onClick={openCreate} className="mt-3 text-sm text-blue-600 hover:text-blue-700">
              + 接入第一个模型
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {models.map((m) => {
              const ti = typeInfo(m.model_type);
              return (
                <div key={m.id} className={`relative border rounded-xl p-4 hover:shadow-md transition-all group ${m.is_active ? "bg-white border-gray-200" : "bg-gray-50 border-gray-200 opacity-70"}`}>
                  {/* 默认标记 */}
                  {m.is_default && (
                    <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center shadow">
                      <Star size={10} className="mr-0.5" /> 默认
                    </div>
                  )}

                  {/* 头部 */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-800 text-sm truncate">{m.name}</h3>
                        {m.is_active ? (
                          <span className="w-2 h-2 bg-green-500 rounded-full shrink-0" title="已启用" />
                        ) : (
                          <span className="w-2 h-2 bg-gray-400 rounded-full shrink-0" title="已禁用" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">{m.model_id}</p>
                    </div>
                  </div>

                  {/* 标签 */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ti.color}`}>
                      {ti.label}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {m.deployment_label}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {PROVIDERS.find((p) => p.value === m.provider)?.label || m.provider}
                    </span>
                  </div>

                  {/* 参数预览 */}
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px] text-gray-500 mb-3 bg-gray-50 p-2 rounded-lg">
                    <div>温度: <span className="font-medium text-gray-700">{m.temperature}</span></div>
                    <div>MaxLen: <span className="font-medium text-gray-700">{m.max_tokens}</span></div>
                    <div>Top-P: <span className="font-medium text-gray-700">{m.top_p}</span></div>
                  </div>

                  {/* 描述 */}
                  {m.description && (
                    <p className="text-xs text-gray-400 truncate mb-3" title={m.description}>
                      {m.description}
                    </p>
                  )}

                  {/* 操作 */}
                  <div className="flex gap-1.5 pt-2 border-t">
                    <button
                      onClick={() => handleTest(m.id)}
                      disabled={testing === m.id}
                      className="text-[11px] text-green-600 hover:bg-green-50 px-2 py-1 rounded flex items-center transition-colors disabled:opacity-50"
                    >
                      {testing === m.id ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Zap size={12} className="mr-1" />}
                      测试连接
                    </button>
                    <button
                      onClick={() => openEdit(m)}
                      className="text-[11px] text-blue-600 hover:bg-blue-50 px-2 py-1 rounded flex items-center transition-colors"
                    >
                      <Edit2 size={12} className="mr-1" /> 编辑
                    </button>
                    <button
                      onClick={() => handleDelete(m)}
                      className="text-[11px] text-red-500 hover:bg-red-50 px-2 py-1 rounded flex items-center transition-colors"
                    >
                      <Trash2 size={12} className="mr-1" /> 删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="p-2 border-t bg-gray-50 text-xs text-gray-400 text-right flex justify-end items-center px-4">
        <span>共 {total} 个模型</span>
      </div>

      {/* 新建 / 编辑弹窗 */}
      {showForm && (
        <Modal
          title={editingId ? "编辑模型配置" : "接入新模型"}
          size="lg"
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center"
              >
                {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                {editingId ? "保存修改" : "确认接入"}
              </button>
            </>
          }
        >
          <div className="space-y-6">
            {/* 基本信息 */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                <Info size={14} className="mr-1.5 text-blue-500" /> 基本信息
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">模型名称 <span className="text-red-500">*</span></label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="如：GPT-4o 主力模型" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">模型标识符 <span className="text-red-500">*</span></label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="如：gpt-4o, qwen-72b-chat" value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">模型供应商</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
                    {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">模型用途</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.model_type} onChange={(e) => setForm({ ...form, model_type: e.target.value })}>
                    {MODEL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* 部署与连接 */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center">
                <Server size={14} className="mr-1.5 text-green-500" /> 部署与连接
              </h4>
              <div className="flex gap-3 mb-3">
                {DEPLOYMENTS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setForm({ ...form, deployment: d.value })}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${form.deployment === d.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 hover:border-gray-300"}`}
                  >
                    <d.icon size={16} />
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">API 端点地址 <span className="text-red-500">*</span></label>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                    placeholder={form.deployment === "local" ? "http://localhost:11434/v1" : "https://api.openai.com/v1"}
                    value={form.endpoint_url}
                    onChange={(e) => setForm({ ...form, endpoint_url: e.target.value })}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    {form.deployment === "local"
                      ? "本地模型地址，如 Ollama 默认 http://localhost:11434/v1"
                      : "远端 API 端点，需兼容 OpenAI 格式"}
                  </p>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">API 密钥</label>
                  <input
                    type="password"
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                    placeholder={editingId ? "留空则不修改已有密钥" : "sk-..."}
                    value={form.api_key}
                    onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* 模型参数 */}
            <div>
              <button
                onClick={() => setShowParams(!showParams)}
                className="w-full flex items-center justify-between text-sm font-bold text-gray-700 mb-3 hover:text-blue-600 transition-colors"
              >
                <span className="flex items-center">
                  <Settings2 size={14} className="mr-1.5 text-orange-500" /> 模型参数配置
                  <span className="text-[10px] text-gray-400 ml-2 font-normal">(提供参数说明与推荐值)</span>
                </span>
                {showParams ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showParams && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-4 bg-gray-50 rounded-xl border">
                  <ParamSlider paramKey="temperature" value={form.temperature ?? 0.7} onChange={(v) => setForm({ ...form, temperature: v })} />
                  <ParamSlider paramKey="max_tokens" value={form.max_tokens ?? 2048} onChange={(v) => setForm({ ...form, max_tokens: Math.round(v) })} />
                  <ParamSlider paramKey="top_p" value={form.top_p ?? 0.9} onChange={(v) => setForm({ ...form, top_p: v })} />
                  <ParamSlider paramKey="top_k" value={form.top_k ?? 50} onChange={(v) => setForm({ ...form, top_k: Math.round(v) })} />
                  <ParamSlider paramKey="frequency_penalty" value={form.frequency_penalty ?? 0} onChange={(v) => setForm({ ...form, frequency_penalty: v })} />
                  <ParamSlider paramKey="presence_penalty" value={form.presence_penalty ?? 0} onChange={(v) => setForm({ ...form, presence_penalty: v })} />
                </div>
              )}
            </div>

            {/* 其他设置 */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3">其他设置</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">模型描述</label>
                  <textarea
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    rows={2}
                    placeholder="可选：记录模型用途、特点等"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                    启用此模型
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-yellow-500" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
                    设为该用途默认模型
                  </label>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {ConfirmDialog}
    </div>
  );
};
