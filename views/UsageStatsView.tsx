import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart3,
  Calendar,
  Download,
  Loader2,
  Search,
  Bell,
  BellOff,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Zap,
  Users,
  Clock,
  Activity,
  ArrowUp,
  ArrowDown,
  Eye,
  Filter,
  RefreshCw,
} from "lucide-react";
import {
  apiGetUsageOverview,
  apiGetUsageByTime,
  apiGetUsageByFunction,
  apiGetUsageByUser,
  apiListUsageRecords,
  apiExportUsage,
  apiListAlerts,
  apiMarkAlertRead,
  apiMarkAllAlertsRead,
  apiGetUnreadAlertCount,
  type UsageOverview,
  type UsageByTime,
  type UsageByFunction,
  type UsageByUser,
  type UsageRecordItem,
  type UsageAlertItem,
} from "../api";

/* ── 简易柱状图 ── */
const SimpleBarChart = ({ data, valueKey, labelKey, color = "bg-blue-500", height = 160 }: {
  data: any[];
  valueKey: string;
  labelKey: string;
  color?: string;
  height?: number;
}) => {
  if (!data.length) return <div className="text-xs text-gray-400 text-center py-8">暂无数据</div>;
  const maxVal = Math.max(...data.map((d) => d[valueKey] || 0), 1);
  return (
    <div className="flex items-end gap-1 overflow-x-auto pb-6 pt-2" style={{ height }}>
      {data.map((d, i) => {
        const pct = ((d[valueKey] || 0) / maxVal) * 100;
        const label = d[labelKey] || "";
        const shortLabel = typeof label === "string" && label.length > 5 ? label.slice(5, 10) : label;
        return (
          <div key={i} className="flex flex-col items-center flex-1 min-w-[24px] group relative">
            <div className="absolute -top-6 text-[10px] text-gray-500 font-medium opacity-0 group-hover:opacity-100 transition bg-white px-1 rounded shadow whitespace-nowrap z-10">
              {(d[valueKey] || 0).toLocaleString()}
            </div>
            <div
              className={`w-full max-w-[32px] ${color} rounded-t transition-all group-hover:opacity-80`}
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
            <div className="text-[9px] text-gray-400 mt-1 truncate w-full text-center" title={label}>
              {shortLabel}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ── 环形进度 ── */
const DonutChart = ({ items, total }: { items: { label: string; value: number; color: string }[]; total: number }) => {
  if (total === 0) return <div className="text-xs text-gray-400 text-center py-8">暂无数据</div>;
  let cumPct = 0;
  return (
    <div className="flex items-center gap-6">
      <div className="relative w-28 h-28 shrink-0">
        <svg viewBox="0 0 42 42" className="w-full h-full -rotate-90">
          {items.map((item, i) => {
            const pct = (item.value / total) * 100;
            const offset = 100 - cumPct;
            cumPct += pct;
            return (
              <circle
                key={i}
                cx="21" cy="21" r="15.9"
                fill="transparent"
                stroke={item.color}
                strokeWidth="5"
                strokeDasharray={`${pct} ${100 - pct}`}
                strokeDashoffset={offset}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-sm font-bold text-gray-800">{total.toLocaleString()}</div>
            <div className="text-[10px] text-gray-400">总计</div>
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            <span className="flex-1 text-gray-600 truncate">{item.label}</span>
            <span className="font-medium text-gray-800">{item.value.toLocaleString()}</span>
            <span className="text-gray-400 w-10 text-right">{total ? ((item.value / total) * 100).toFixed(1) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Tab 组件 ── */
type TabId = "overview" | "records" | "alerts";
const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "overview", label: "数据总览", icon: BarChart3 },
  { id: "records", label: "调用明细", icon: Activity },
  { id: "alerts", label: "异常告警", icon: Bell },
];

const FUNC_COLORS = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#84CC16", "#6366F1", "#F97316"];

/* ── 主视图 ── */
export const UsageStatsView = ({ toast }: { toast: any }) => {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState("day");

  // Overview
  const [overview, setOverview] = useState<UsageOverview | null>(null);
  const [byTime, setByTime] = useState<UsageByTime[]>([]);
  const [byFunction, setByFunction] = useState<UsageByFunction[]>([]);
  const [byUser, setByUser] = useState<UsageByUser[]>([]);

  // Records
  const [records, setRecords] = useState<UsageRecordItem[]>([]);
  const [recordTotal, setRecordTotal] = useState(0);
  const [recordPage, setRecordPage] = useState(1);
  const [filterUser, setFilterUser] = useState("");
  const [filterFunc, setFilterFunc] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Alerts
  const [alerts, setAlerts] = useState<UsageAlertItem[]>([]);
  const [alertTotal, setAlertTotal] = useState(0);
  const [alertPage, setAlertPage] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);

  const dateFilter = useMemo(() => ({ start_date: startDate, end_date: endDate }), [startDate, endDate]);

  /* 加载总览 */
  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, bt, bf, bu] = await Promise.all([
        apiGetUsageOverview(dateFilter),
        apiGetUsageByTime(granularity, dateFilter),
        apiGetUsageByFunction(dateFilter),
        apiGetUsageByUser(1, 10, dateFilter),
      ]);
      setOverview(ov);
      setByTime(bt);
      setByFunction(bf);
      setByUser(bu.items);
    } catch (err: any) {
      toast.error("加载统计数据失败: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, granularity]);

  /* 加载调用明细 */
  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const filters: any = { ...dateFilter };
      if (filterUser) filters.user_keyword = filterUser;
      if (filterFunc) filters.function_type = filterFunc;
      if (filterStatus) filters.status = filterStatus;
      const data = await apiListUsageRecords(recordPage, 50, filters);
      setRecords(data.items);
      setRecordTotal(data.total);
    } catch (err: any) {
      toast.error("加载调用记录失败: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [recordPage, filterUser, filterFunc, filterStatus, dateFilter]);

  /* 加载告警 */
  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const [data, unread] = await Promise.all([
        apiListAlerts(alertPage, 50),
        apiGetUnreadAlertCount(),
      ]);
      setAlerts(data.items);
      setAlertTotal(data.total);
      setUnreadCount(unread.count);
    } catch (err: any) {
      toast.error("加载告警失败: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [alertPage]);

  useEffect(() => {
    if (activeTab === "overview") loadOverview();
    else if (activeTab === "records") loadRecords();
    else if (activeTab === "alerts") loadAlerts();
  }, [activeTab, loadOverview, loadRecords, loadAlerts]);

  /* 导出 */
  const handleExport = async () => {
    try {
      const filters: any = { ...dateFilter };
      if (filterFunc) filters.function_type = filterFunc;
      if (filterUser) filters.user_keyword = filterUser;
      const blob = await apiExportUsage(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `usage_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("导出成功");
    } catch (err: any) {
      toast.error("导出失败: " + err.message);
    }
  };

  /* 标记告警已读 */
  const handleMarkRead = async (id: string) => {
    try {
      await apiMarkAlertRead(id);
      loadAlerts();
    } catch (err: any) {
      toast.error("操作失败: " + err.message);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiMarkAllAlertsRead();
      toast.success("全部已读");
      loadAlerts();
    } catch (err: any) {
      toast.error("操作失败: " + err.message);
    }
  };

  const severityStyle = (s: string) => {
    if (s === "critical") return "bg-red-100 text-red-700 border-red-200";
    if (s === "warning") return "bg-yellow-100 text-yellow-700 border-yellow-200";
    return "bg-blue-100 text-blue-700 border-blue-200";
  };

  const severityLabel = (s: string) => {
    if (s === "critical") return "严重";
    if (s === "warning") return "警告";
    return "提示";
  };

  /* ── KPI 卡片 ── */
  const StatCard = ({ icon: Icon, label, value, sub, color }: any) => (
    <div className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-800">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-1">{sub}</div>}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="font-bold text-gray-700 flex items-center">
            <BarChart3 size={18} className="mr-2" /> 用量统计
          </div>
          <div className="flex bg-white rounded-lg border overflow-hidden shadow-sm">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${
                  activeTab === tab.id ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                <tab.icon size={13} />
                {tab.label}
                {tab.id === "alerts" && unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] px-1.5 py-0 rounded-full">{unreadCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex items-center space-x-1 text-xs text-gray-600 bg-white border rounded-md px-2 py-1 shadow-sm">
            <Calendar size={14} className="text-gray-400 mr-1" />
            <input type="date" className="outline-none bg-transparent w-28" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <span className="text-gray-400">-</span>
            <input type="date" className="outline-none bg-transparent w-28" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          {activeTab === "records" && (
            <button
              onClick={handleExport}
              className="text-xs text-green-700 hover:bg-green-50 border border-green-200 px-3 py-1.5 rounded flex items-center transition-colors"
            >
              <Download size={12} className="mr-1" /> 导出CSV
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-blue-500" size={28} />
          </div>
        )}

        {/* ===== 数据总览 ===== */}
        {!loading && activeTab === "overview" && overview && (
          <div className="p-4 space-y-6">
            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Zap} label="总调用次数" value={overview.total_calls} color="bg-blue-500" />
              <StatCard icon={TrendingUp} label="总 Token 消耗" value={overview.total_tokens} sub={`入${overview.total_input_tokens.toLocaleString()} / 出${overview.total_output_tokens.toLocaleString()}`} color="bg-purple-500" />
              <StatCard icon={Users} label="活跃用户数" value={overview.active_users} color="bg-green-500" />
              <StatCard icon={Clock} label="平均耗时" value={`${overview.avg_duration_ms}ms`} sub={`成功率 ${overview.success_rate}% · 错误 ${overview.error_count}`} color="bg-amber-500" />
            </div>

            {/* 时间趋势 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-gray-700">调用趋势</h4>
                  <select className="text-xs border rounded px-2 py-1" value={granularity} onChange={(e) => setGranularity(e.target.value)}>
                    <option value="hour">按小时</option>
                    <option value="day">按天</option>
                    <option value="week">按周</option>
                    <option value="month">按月</option>
                  </select>
                </div>
                <SimpleBarChart data={byTime} valueKey="call_count" labelKey="time" color="bg-blue-500" />
              </div>
              <div className="border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-gray-700">Token 消耗趋势</h4>
                </div>
                <SimpleBarChart data={byTime} valueKey="token_count" labelKey="time" color="bg-purple-500" />
              </div>
            </div>

            {/* 功能维度 + 用户维度 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border rounded-xl p-4">
                <h4 className="text-sm font-bold text-gray-700 mb-3">功能维度分布</h4>
                <DonutChart
                  items={byFunction.map((f, i) => ({
                    label: f.function_label,
                    value: f.call_count,
                    color: FUNC_COLORS[i % FUNC_COLORS.length],
                  }))}
                  total={byFunction.reduce((s, f) => s + f.call_count, 0)}
                />
                {/* 功能明细表 */}
                <div className="mt-4 border-t pt-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400">
                        <th className="text-left pb-2 font-medium">功能</th>
                        <th className="text-right pb-2 font-medium">调用次数</th>
                        <th className="text-right pb-2 font-medium">Token</th>
                        <th className="text-right pb-2 font-medium">平均耗时</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {byFunction.map((f) => (
                        <tr key={f.function_type} className="hover:bg-gray-50">
                          <td className="py-1.5 text-gray-700">{f.function_label}</td>
                          <td className="py-1.5 text-right font-medium">{f.call_count.toLocaleString()}</td>
                          <td className="py-1.5 text-right text-gray-500">{f.token_count.toLocaleString()}</td>
                          <td className="py-1.5 text-right text-gray-500">{f.avg_duration_ms}ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border rounded-xl p-4">
                <h4 className="text-sm font-bold text-gray-700 mb-3">用户维度 TOP10</h4>
                {byUser.length === 0 ? (
                  <div className="text-xs text-gray-400 text-center py-8">暂无数据</div>
                ) : (
                  <div className="space-y-2">
                    {byUser.map((u, i) => {
                      const maxCalls = byUser[0]?.call_count || 1;
                      const pct = (u.call_count / maxCalls) * 100;
                      return (
                        <div key={u.user_id || i} className="flex items-center gap-3">
                          <div className="w-5 text-xs text-gray-400 text-right font-medium">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs font-medium text-gray-700 truncate">{u.user_display_name}</span>
                              <span className="text-xs text-gray-500">{u.call_count.toLocaleString()} 次</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                              <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex gap-3 mt-0.5 text-[10px] text-gray-400">
                              <span>Token: {u.token_count.toLocaleString()}</span>
                              <span>均耗时: {u.avg_duration_ms}ms</span>
                              {u.error_count > 0 && <span className="text-red-400">错误: {u.error_count}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== 调用明细 ===== */}
        {!loading && activeTab === "records" && (
          <div className="flex flex-col h-full">
            <div className="p-3 border-b bg-gray-50 flex gap-2 flex-wrap items-center">
              <div className="flex items-center space-x-2 bg-white border rounded-md px-2 py-1 shadow-sm">
                <Search size={14} className="text-gray-400" />
                <input className="text-xs outline-none w-28 bg-transparent" placeholder="搜索用户..." value={filterUser} onChange={(e) => setFilterUser(e.target.value)} />
              </div>
              <select className="text-xs border rounded-md px-2 py-1.5 bg-white shadow-sm" value={filterFunc} onChange={(e) => setFilterFunc(e.target.value)}>
                <option value="">全部功能</option>
                <option value="doc_draft">公文起草</option>
                <option value="doc_check">公文审查</option>
                <option value="doc_format">公文排版</option>
                <option value="qa_chat">智能问答</option>
                <option value="entity_extract">实体抽取</option>
                <option value="knowledge_qa">知识检索</option>
              </select>
              <select className="text-xs border rounded-md px-2 py-1.5 bg-white shadow-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">全部状态</option>
                <option value="success">成功</option>
                <option value="error">错误</option>
              </select>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="p-3 whitespace-nowrap font-semibold text-xs">时间</th>
                    <th className="p-3 whitespace-nowrap font-semibold text-xs">用户</th>
                    <th className="p-3 whitespace-nowrap font-semibold text-xs">功能</th>
                    <th className="p-3 whitespace-nowrap font-semibold text-xs">模型</th>
                    <th className="p-3 whitespace-nowrap font-semibold text-xs text-right">输入Token</th>
                    <th className="p-3 whitespace-nowrap font-semibold text-xs text-right">输出Token</th>
                    <th className="p-3 whitespace-nowrap font-semibold text-xs text-right">总Token</th>
                    <th className="p-3 whitespace-nowrap font-semibold text-xs text-right">耗时</th>
                    <th className="p-3 whitespace-nowrap font-semibold text-xs">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-3 text-xs text-gray-500 font-mono whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="p-3 text-xs font-medium text-gray-800">{r.user_display_name}</td>
                      <td className="p-3"><span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{r.function_label}</span></td>
                      <td className="p-3 text-xs text-gray-500">{r.model_name || "-"}</td>
                      <td className="p-3 text-xs text-right text-gray-600">{r.tokens_input.toLocaleString()}</td>
                      <td className="p-3 text-xs text-right text-gray-600">{r.tokens_output.toLocaleString()}</td>
                      <td className="p-3 text-xs text-right font-medium">{r.tokens_total.toLocaleString()}</td>
                      <td className="p-3 text-xs text-right text-gray-500">{r.duration_ms}ms</td>
                      <td className="p-3">
                        {r.status === "success" ? (
                          <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center w-fit">
                            <CheckCircle size={10} className="mr-0.5" /> 成功
                          </span>
                        ) : (
                          <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded flex items-center w-fit" title={r.error_message || ""}>
                            <XCircle size={10} className="mr-0.5" /> 失败
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-gray-400">
                        <Search size={48} className="mb-4 text-gray-200 mx-auto block" />
                        <p>没有符合条件的调用记录</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-2 border-t bg-gray-50 text-xs text-gray-400 text-right flex justify-between items-center px-4">
              <div className="flex gap-2">
                <button disabled={recordPage <= 1} onClick={() => setRecordPage(recordPage - 1)} className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-40">上一页</button>
                <span className="px-2 py-1">第 {recordPage} 页</span>
                <button disabled={records.length < 50} onClick={() => setRecordPage(recordPage + 1)} className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-40">下一页</button>
              </div>
              <span>共 {recordTotal} 条记录</span>
            </div>
          </div>
        )}

        {/* ===== 异常告警 ===== */}
        {!loading && activeTab === "alerts" && (
          <div className="flex flex-col h-full">
            <div className="p-3 border-b bg-gray-50 flex gap-3 items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Bell size={14} />
                <span>{unreadCount} 条未读告警</span>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1 rounded transition-colors"
                >
                  全部标记已读
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <BellOff size={48} className="mb-4 text-gray-300" />
                  <p className="text-sm">暂无告警信息</p>
                  <p className="text-xs mt-1">系统运行正常</p>
                </div>
              ) : (
                alerts.map((a) => (
                  <div key={a.id} className={`border rounded-xl p-4 transition-all ${a.is_read ? "bg-gray-50 border-gray-200" : "bg-white border-l-4 shadow-sm"} ${!a.is_read ? (a.severity === "critical" ? "border-l-red-500" : a.severity === "warning" ? "border-l-yellow-500" : "border-l-blue-500") : ""}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${a.severity === "critical" ? "bg-red-100" : a.severity === "warning" ? "bg-yellow-100" : "bg-blue-100"}`}>
                          <AlertTriangle size={14} className={a.severity === "critical" ? "text-red-500" : a.severity === "warning" ? "text-yellow-500" : "text-blue-500"} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${severityStyle(a.severity)}`}>
                              {severityLabel(a.severity)}
                            </span>
                            <h4 className="text-sm font-bold text-gray-800">{a.title}</h4>
                          </div>
                          {a.detail && <p className="text-xs text-gray-500 mt-0.5">{a.detail}</p>}
                          <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                            {a.user_display_name && <span>用户: {a.user_display_name}</span>}
                            <span>{new Date(a.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      {!a.is_read && (
                        <button
                          onClick={() => handleMarkRead(a.id)}
                          className="text-[11px] text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors shrink-0"
                        >
                          标记已读
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-2 border-t bg-gray-50 text-xs text-gray-400 text-right flex justify-between items-center px-4">
              <div className="flex gap-2">
                <button disabled={alertPage <= 1} onClick={() => setAlertPage(alertPage - 1)} className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-40">上一页</button>
                <span className="px-2 py-1">第 {alertPage} 页</span>
                <button disabled={alerts.length < 50} onClick={() => setAlertPage(alertPage + 1)} className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-40">下一页</button>
              </div>
              <span>共 {alertTotal} 条告警</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
