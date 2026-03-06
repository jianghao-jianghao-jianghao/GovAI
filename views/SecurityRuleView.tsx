import React, { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  XCircle,
  X,
  FlaskConical,
} from "lucide-react";
import {
  apiListRules,
  apiCreateRule,
  apiUpdateRule,
  apiDeleteRule,
  apiCheckSensitive,
  type SensitiveRule,
} from "../api";

/* ── 常量 ── */
const ACTION_OPTIONS = [
  { value: "block", label: "拦截", color: "text-red-600 bg-red-50 border-red-200", icon: XCircle },
  { value: "warn", label: "警告", color: "text-amber-600 bg-amber-50 border-amber-200", icon: AlertTriangle },
  { value: "log", label: "仅记录", color: "text-blue-600 bg-blue-50 border-blue-200", icon: ShieldCheck },
];

const LEVEL_OPTIONS = [
  { value: "high", label: "高", color: "text-red-700 bg-red-100" },
  { value: "medium", label: "中", color: "text-amber-700 bg-amber-100" },
  { value: "low", label: "低", color: "text-green-700 bg-green-100" },
];

const ACTION_TO_LEVEL: Record<string, string> = {
  block: "high",
  warn: "medium",
  log: "low",
};

const getActionMeta = (action: string) =>
  ACTION_OPTIONS.find((a) => a.value === action) || ACTION_OPTIONS[2];

const getLevelMeta = (level: string) =>
  LEVEL_OPTIONS.find((l) => l.value === level) || LEVEL_OPTIONS[1];

/* ── 编辑弹窗 ── */
const RuleModal = ({
  rule,
  onSave,
  onClose,
}: {
  rule: Partial<SensitiveRule> | null;
  onSave: (data: { keyword: string; action: string; note?: string }) => Promise<void>;
  onClose: () => void;
}) => {
  const isEdit = !!rule?.id;
  const [keyword, setKeyword] = useState(rule?.keyword || "");
  const [action, setAction] = useState(rule?.action || "block");
  const [note, setNote] = useState(rule?.note || "");
  const [saving, setSaving] = useState(false);

  const derivedLevel = ACTION_TO_LEVEL[action] || "medium";
  const derivedLevelMeta = getLevelMeta(derivedLevel);

  const handleSubmit = async () => {
    if (!keyword.trim()) return;
    setSaving(true);
    try {
      await onSave({ keyword: keyword.trim(), action, note: note.trim() || undefined });
      onClose();
    } catch {
      // error handled by parent
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Shield size={16} className="text-blue-600" />
            {isEdit ? "编辑规则" : "新建规则"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">关键词 *</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="输入敏感关键词"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">触发动作</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {ACTION_OPTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">严重级别</label>
              <div className={`w-full border rounded-lg px-3 py-2 text-sm ${derivedLevelMeta.color}`}>
                {derivedLevelMeta.label}
                <span className="text-[10px] text-gray-400 ml-1.5">（由动作自动决定）</span>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">备注</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="选填，说明规则用途"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
          <button
            onClick={handleSubmit}
            disabled={saving || !keyword.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? "保存" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── 主视图 ── */
export const SecurityRuleView = ({ toast }: { toast: any }) => {
  const [rules, setRules] = useState<SensitiveRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [editRule, setEditRule] = useState<Partial<SensitiveRule> | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 检测面板
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState<{
    passed: boolean;
    hits: { keyword: string; action: string; level: string; note: string }[];
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (filterAction) filters.action = filterAction;
      const data = await apiListRules(filters);
      setRules(data);
    } catch (err: any) {
      toast.error("加载规则失败: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [filterAction]);

  useEffect(() => { loadRules(); }, [loadRules]);

  const handleCreate = () => {
    setEditRule({});
    setShowModal(true);
  };

  const handleEdit = (rule: SensitiveRule) => {
    setEditRule(rule);
    setShowModal(true);
  };

  const handleSave = async (data: { keyword: string; action: string; note?: string }) => {
    try {
      if (editRule?.id) {
        await apiUpdateRule(editRule.id, data);
        toast.success("规则已更新");
      } else {
        await apiCreateRule(data);
        toast.success("规则已创建");
      }
      loadRules();
    } catch (err: any) {
      toast.error("操作失败: " + err.message);
      throw err;
    }
  };

  const handleDelete = async (rule: SensitiveRule) => {
    if (!confirm(`确定删除规则「${rule.keyword}」？`)) return;
    setDeletingId(rule.id);
    try {
      await apiDeleteRule(rule.id);
      toast.success("规则已删除");
      loadRules();
    } catch (err: any) {
      toast.error("删除失败: " + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (rule: SensitiveRule) => {
    try {
      await apiUpdateRule(rule.id, { is_active: !rule.is_active });
      toast.success(rule.is_active ? "已停用" : "已启用");
      loadRules();
    } catch (err: any) {
      toast.error("操作失败: " + err.message);
    }
  };

  const handleTest = async () => {
    if (!testText.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiCheckSensitive(testText.trim());
      setTestResult(result);
    } catch (err: any) {
      toast.error("检测失败: " + err.message);
    } finally {
      setTesting(false);
    }
  };

  // 前端过滤搜索
  const filteredRules = rules.filter((r) =>
    !searchTerm || r.keyword.toLowerCase().includes(searchTerm.toLowerCase()) || (r.note || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: rules.length,
    active: rules.filter((r) => r.is_active).length,
    block: rules.filter((r) => r.action === "block").length,
    warn: rules.filter((r) => r.action === "warn").length,
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border overflow-hidden">
      {/* 顶栏 */}
      <div className="px-5 py-4 border-b bg-gradient-to-r from-white to-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center">
              <Shield size={18} className="text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-800">安全规则配置</h2>
              <p className="text-xs text-gray-400 mt-0.5">管理敏感词过滤与拦截规则</p>
            </div>
          </div>
          <button
            onClick={handleCreate}
            className="px-3.5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} /> 新建规则
          </button>
        </div>

        {/* 统计 */}
        <div className="flex gap-4 mt-4">
          <div className="text-xs text-gray-500">
            共 <span className="font-bold text-gray-800">{stats.total}</span> 条规则
          </div>
          <div className="text-xs text-green-600">
            <CheckCircle size={11} className="inline mr-0.5" />启用 {stats.active}
          </div>
          <div className="text-xs text-red-500">
            <XCircle size={11} className="inline mr-0.5" />拦截 {stats.block}
          </div>
          <div className="text-xs text-amber-600">
            <AlertTriangle size={11} className="inline mr-0.5" />警告 {stats.warn}
          </div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="px-5 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="搜索关键词或备注…"
          />
        </div>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">全部动作</option>
          {ACTION_OPTIONS.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
      </div>

      {/* 规则列表 */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-blue-500" size={28} />
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <ShieldAlert size={48} className="mb-3 text-gray-300" />
            <p className="text-sm">{searchTerm ? "没有匹配的规则" : "暂无规则，点击上方「新建规则」添加"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr className="text-left text-xs text-gray-500 uppercase">
                <th className="px-5 py-3 font-medium">关键词</th>
                <th className="px-3 py-3 font-medium">动作</th>
                <th className="px-3 py-3 font-medium">级别</th>
                <th className="px-3 py-3 font-medium">状态</th>
                <th className="px-3 py-3 font-medium">备注</th>
                <th className="px-3 py-3 font-medium">创建时间</th>
                <th className="px-3 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRules.map((rule) => {
                const actionMeta = getActionMeta(rule.action);
                const levelMeta = getLevelMeta(rule.level);
                const ActionIcon = actionMeta.icon;
                return (
                  <tr key={rule.id} className={`hover:bg-gray-50 transition ${!rule.is_active ? "opacity-50" : ""}`}>
                    <td className="px-5 py-3">
                      <span className="font-medium text-gray-800 bg-gray-100 px-2 py-0.5 rounded">
                        {rule.keyword}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${actionMeta.color}`}>
                        <ActionIcon size={11} />
                        {actionMeta.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${levelMeta.color}`}>
                        {levelMeta.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => handleToggleActive(rule)}
                        className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${rule.is_active ? "bg-green-500" : "bg-gray-300"}`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${rule.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs max-w-[200px] truncate" title={rule.note || ""}>
                      {rule.note || "-"}
                    </td>
                    <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(rule.created_at).toLocaleDateString("zh-CN")}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(rule)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="编辑"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(rule)}
                          disabled={deletingId === rule.id}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                          title="删除"
                        >
                          {deletingId === rule.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 底部：敏感词检测面板 */}
      <div className="border-t bg-gray-50 px-5 py-3">
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical size={14} className="text-purple-500" />
          <span className="text-xs font-bold text-gray-600">敏感词检测测试</span>
        </div>
        <div className="flex gap-2">
          <input
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTest()}
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
            placeholder="输入文本进行敏感词检测…"
          />
          <button
            onClick={handleTest}
            disabled={testing || !testText.trim()}
            className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            检测
          </button>
        </div>
        {testResult && (
          <div className={`mt-2 p-3 rounded-lg border text-sm ${testResult.passed ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
            <div className={`font-medium flex items-center gap-1.5 ${testResult.passed ? "text-green-700" : "text-red-700"}`}>
              {testResult.passed ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {testResult.passed ? "检测通过，未触发任何规则" : `触发 ${testResult.hits.length} 条规则`}
            </div>
            {!testResult.passed && (
              <div className="mt-2 space-y-1">
                {testResult.hits.map((h, i) => {
                  const am = getActionMeta(h.action);
                  const lm = getLevelMeta(h.level);
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                      <span className="font-medium text-red-600">「{h.keyword}」</span>
                      <span className={`px-1.5 py-0.5 rounded border ${am.color}`}>{am.label}</span>
                      <span className={`px-1.5 py-0.5 rounded ${lm.color}`}>{lm.label}</span>
                      {h.note && <span className="text-gray-400">· {h.note}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 弹窗 */}
      {showModal && (
        <RuleModal
          rule={editRule}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditRule(null); }}
        />
      )}
    </div>
  );
};
