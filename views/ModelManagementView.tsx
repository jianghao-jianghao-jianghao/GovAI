import React, { useState, useEffect, useCallback } from "react";
import {
  Cpu,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
  RefreshCw,
  ExternalLink,
  MessageSquare,
  FileText,
  Database,
  HelpCircle,
  Settings2,
  ChevronDown,
  ChevronUp,
  Monitor,
  ArrowUpRight,
} from "lucide-react";
import {
  apiListDifyApps,
  apiTestDifyApp,
  apiTestAllDifyApps,
  apiGetParamInfo,
  type DifyAppItem,
  type DifyAppListResult,
  type DifyTestAllItem,
  type ParamInfo,
} from "../api";

/* ── 分类图标 ── */
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  core: <MessageSquare size={14} className="text-blue-500" />,
  document: <FileText size={14} className="text-green-600" />,
  knowledge: <Database size={14} className="text-purple-500" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  core: "border-blue-200 bg-blue-50",
  document: "border-green-200 bg-green-50",
  knowledge: "border-purple-200 bg-purple-50",
};

/* ── 主视图 ── */
export const ModelManagementView = ({ toast, currentUser }: { toast: any; currentUser: any }) => {
  const [appList, setAppList] = useState<DifyAppListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<Record<string, DifyTestAllItem>>({});
  const [testingAll, setTestingAll] = useState(false);
  const [testingSingle, setTestingSingle] = useState<string | null>(null);

  const [paramInfo, setParamInfo] = useState<ParamInfo[]>([]);
  const [showParams, setShowParams] = useState(false);

  /* 加载服务列表 */
  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiListDifyApps();
      setAppList(data);
    } catch (err: any) {
      toast.error("加载 AI 服务列表失败: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadApps(); }, [loadApps]);

  /* 加载参数说明 */
  useEffect(() => {
    apiGetParamInfo().then(setParamInfo).catch(() => {});
  }, []);

  /* 批量连通测试 */
  const handleTestAll = async () => {
    setTestingAll(true);
    setTestResults({});
    try {
      const data = await apiTestAllDifyApps();
      const map: Record<string, DifyTestAllItem> = {};
      data.results.forEach((r) => { map[r.key] = r; });
      setTestResults(map);
      toast.success(`测试完成：${data.ok_count}/${data.total_configured} 个服务正常`);
    } catch (err: any) {
      toast.error("批量测试失败: " + err.message);
    } finally {
      setTestingAll(false);
    }
  };

  /* 单个连通测试 */
  const handleTestSingle = async (appKey: string) => {
    setTestingSingle(appKey);
    try {
      const result = await apiTestDifyApp(appKey);
      setTestResults((prev) => ({
        ...prev,
        [appKey]: {
          key: appKey,
          name: appList?.items.find((a) => a.key === appKey)?.name || appKey,
          status: "ok",
          response_time_ms: result.response_time_ms,
          message: "正常",
        },
      }));
      toast.success(`连接正常，响应耗时 ${result.response_time_ms}ms`);
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [appKey]: {
          key: appKey,
          name: appList?.items.find((a) => a.key === appKey)?.name || appKey,
          status: "error",
          message: err.message,
        },
      }));
      toast.error("连接测试失败: " + err.message);
    } finally {
      setTestingSingle(null);
    }
  };

  /* 状态标记 */
  const StatusBadge = ({ item }: { item: DifyAppItem }) => {
    const tr = testResults[item.key];
    if (tr) {
      if (tr.status === "ok") {
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
            <CheckCircle size={11} /> 连通 {tr.response_time_ms && `${tr.response_time_ms}ms`}
          </span>
        );
      }
      if (tr.status === "error") {
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-red-700 bg-red-100 px-2 py-0.5 rounded-full" title={tr.message}>
            <XCircle size={11} /> 异常
          </span>
        );
      }
    }
    if (!item.is_configured) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
          <AlertCircle size={11} /> 未配置
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
        <CheckCircle size={11} /> 已配置
      </span>
    );
  };

  /* 按分类分组 */
  const groupedApps: Record<string, DifyAppItem[]> = (appList?.items || []).reduce<Record<string, DifyAppItem[]>>((acc, item) => {
    const cat = item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200">
      {/* 顶部工具栏 */}
      <div className="p-4 border-b bg-gray-50 flex flex-wrap gap-4 items-center justify-between">
        <div className="font-bold text-gray-700 flex items-center">
          <Monitor size={18} className="mr-2" /> AI 服务运维监控
          <span className="ml-3 text-xs font-normal text-gray-400">
            查看各 AI 应用的配置与连通状态
          </span>
        </div>
        <div className="flex gap-2 items-center">
          {appList?.dify_console_url && (
            <a
              href={appList.dify_console_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-3 py-1.5 rounded flex items-center transition-colors shadow-sm"
            >
              <ArrowUpRight size={13} className="mr-1" /> 打开 Dify 管理后台
            </a>
          )}
          <button
            onClick={loadApps}
            disabled={loading}
            className="text-xs text-gray-600 bg-white border hover:bg-gray-50 px-3 py-1.5 rounded flex items-center transition-colors shadow-sm"
          >
            <RefreshCw size={13} className={`mr-1 ${loading ? "animate-spin" : ""}`} /> 刷新
          </button>
          <button
            onClick={handleTestAll}
            disabled={testingAll}
            className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded flex items-center transition-colors shadow-sm disabled:opacity-60"
          >
            {testingAll
              ? <Loader2 size={13} className="mr-1 animate-spin" />
              : <Zap size={13} className="mr-1" />
            }
            一键测试全部
          </button>
        </div>
      </div>

      {/* Dify 基本信息 */}
      {appList && (
        <div className="px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-indigo-50 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <div className="flex items-center gap-1.5">
            <ExternalLink size={13} className="text-blue-500" />
            <span className="text-gray-500">Service API:</span>
            <span className="font-mono text-blue-700">{appList.dify_base_url}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">已配置:</span>
            <span className="font-bold text-blue-700">{appList.configured_count}/{appList.total}</span>
            <span className="text-gray-400">个 AI 应用</span>
          </div>
          {appList.dify_mock === true && (
            <span className="bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded text-[10px] font-medium">
              ⚠ Mock 模式（仅模拟数据，未连接真实 AI）
            </span>
          )}
          {!appList.dify_mock && appList.configured_count === appList.total && (
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-medium">
              ✓ 全部就绪
            </span>
          )}
          {!appList.dify_mock && appList.configured_count > 0 && appList.configured_count < appList.total && (
            <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-medium">
              部分配置
            </span>
          )}
        </div>
      )}

      {/* 服务列表 */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-blue-500" size={28} />
          </div>
        ) : !appList || appList.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Cpu size={48} className="mb-4 text-gray-300" />
            <p className="text-sm">无法获取 AI 服务配置</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedApps).map(([category, apps]) => (
              <div key={category}>
                <h3 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-1.5">
                  {CATEGORY_ICONS[category]}
                  {apps[0]?.category_label || category}
                  <span className="text-[10px] text-gray-400 font-normal ml-1">
                    ({apps.filter((a) => a.is_configured).length}/{apps.length})
                  </span>
                </h3>
                <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  {apps.map((app) => (
                    <div
                      key={app.key}
                      className={`relative border rounded-xl p-4 transition-all hover:shadow-md ${
                        app.is_configured
                          ? CATEGORY_COLORS[app.category] || "bg-white border-gray-200"
                          : "bg-gray-50 border-gray-200 opacity-60"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-gray-800 text-sm">{app.name}</h4>
                            <StatusBadge item={app} />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{app.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-200/60">
                        <span className="text-[10px] font-mono text-gray-400 bg-gray-100/80 px-1.5 py-0.5 rounded">
                          {app.key}
                        </span>
                        <div className="flex-1" />
                        {app.is_configured && (
                          <button
                            onClick={() => handleTestSingle(app.key)}
                            disabled={testingSingle === app.key}
                            className="text-[11px] text-green-600 hover:bg-green-100 px-2 py-1 rounded flex items-center transition-colors disabled:opacity-50"
                          >
                            {testingSingle === app.key
                              ? <Loader2 size={12} className="mr-1 animate-spin" />
                              : <Zap size={12} className="mr-1" />
                            }
                            测试连接
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 参数说明折叠面板 */}
      <div className="border-t">
        <button
          onClick={() => setShowParams(!showParams)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Settings2 size={13} className="text-orange-500" />
            LLM 参数说明与推荐值
          </span>
          {showParams ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showParams && paramInfo.length > 0 && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {paramInfo.map((p) => (
                <div key={p.key} className="bg-gray-50 border rounded-lg p-3 text-xs">
                  <div className="font-medium text-gray-700 mb-1 flex items-center gap-1">
                    {p.label}
                    <span className="text-[10px] text-gray-400 font-mono">({p.key})</span>
                  </div>
                  <p className="text-gray-500 mb-1.5">{p.description}</p>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-gray-400">范围: {p.min}~{p.max}</span>
                    <span className="text-blue-600 font-medium">推荐: {p.recommended}</span>
                  </div>
                  <p className="text-[10px] text-yellow-700 mt-1">💡 {p.tips}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="p-2 border-t bg-gray-50 text-xs text-gray-400 text-right flex justify-between items-center px-4">
        <span className="flex items-center gap-1">
          <HelpCircle size={12} />
          此面板仅用于运维监控，模型与应用配置请在{" "}
          {appList?.dify_console_url ? (
            <a
              href={appList.dify_console_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              Dify 管理后台
            </a>
          ) : (
            "Dify 管理后台"
          )}
          {" "}中完成
        </span>
        <span>
          共 {appList?.total || 0} 个 AI 应用，已配置 {appList?.configured_count || 0} 个
        </span>
      </div>
    </div>
  );
};
