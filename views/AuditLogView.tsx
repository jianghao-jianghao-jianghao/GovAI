import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  User,
  LayoutDashboard,
  Calendar,
  Search,
  Download,
  Loader2,
} from "lucide-react";
import {
  apiListAuditLogs,
  apiExportAuditLogs,
  type AuditLogItem,
} from "../api";

export const AuditLogView = ({ toast }: { toast: any }) => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState("");
  const [filterModule, setFilterModule] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (filterUser) filters.user_keyword = filterUser;
      if (filterModule) filters.module = filterModule;
      if (startDate) filters.start_date = startDate;
      if (endDate) filters.end_date = endDate;
      const data = await apiListAuditLogs(
        page,
        100,
        Object.keys(filters).length > 0 ? filters : undefined,
      );
      setLogs(data.items);
      setTotal(data.total);
    } catch (err: any) {
      toast.error("加载审计日志失败: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filterUser, filterModule, startDate, endDate]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleExport = async () => {
    try {
      const filters: any = {};
      if (filterUser) filters.user_keyword = filterUser;
      if (filterModule) filters.module = filterModule;
      if (startDate) filters.start_date = startDate;
      if (endDate) filters.end_date = endDate;
      const blob = await apiExportAuditLogs(
        Object.keys(filters).length > 0 ? filters : undefined,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("导出成功");
    } catch (err: any) {
      toast.error("导出失败: " + err.message);
    }
  };

  const resetFilters = () => {
    setFilterUser("");
    setFilterModule("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b bg-gray-50 flex flex-wrap gap-4 items-center justify-between">
        <div className="font-bold text-gray-700 flex items-center">
          <ShieldAlert size={18} className="mr-2" /> 系统审计日志
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex items-center space-x-2 bg-white border rounded-md px-2 py-1 shadow-sm">
            <User size={14} className="text-gray-400" />
            <input
              className="text-xs outline-none w-24 bg-transparent"
              placeholder="筛选用户..."
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-2 bg-white border rounded-md px-2 py-1 shadow-sm">
            <LayoutDashboard size={14} className="text-gray-400" />
            <input
              className="text-xs outline-none w-24 bg-transparent"
              placeholder="筛选模块..."
              value={filterModule}
              onChange={(e) => setFilterModule(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-1 text-xs text-gray-600 bg-white border rounded-md px-2 py-1 shadow-sm">
            <Calendar size={14} className="text-gray-400 mr-1" />
            <input
              type="date"
              className="outline-none bg-transparent w-24"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              className="outline-none bg-transparent w-24"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <button
            onClick={resetFilters}
            className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1 rounded transition-colors"
          >
            重置筛选
          </button>
          <button
            onClick={handleExport}
            className="text-xs text-green-700 hover:bg-green-50 border border-green-200 px-3 py-1.5 rounded flex items-center transition-colors"
          >
            <Download size={12} className="mr-1" /> 导出CSV
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-0">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="p-4 whitespace-nowrap font-semibold">时间</th>
              <th className="p-4 whitespace-nowrap font-semibold">用户</th>
              <th className="p-4 whitespace-nowrap font-semibold">模块</th>
              <th className="p-4 whitespace-nowrap font-semibold">动作</th>
              <th className="p-4 font-semibold">详情</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.map((l) => (
              <tr
                key={l.id}
                className="hover:bg-gray-50 transition-colors group"
              >
                <td className="p-4 text-gray-500 whitespace-nowrap font-mono text-xs">
                  {new Date(l.created_at).toLocaleString()}
                </td>
                <td className="p-4 font-medium text-gray-800">
                  {l.user_display_name}
                </td>
                <td className="p-4">
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs border border-gray-200">
                    {l.module}
                  </span>
                </td>
                <td className="p-4 font-medium text-blue-700">{l.action}</td>
                <td
                  className="p-4 text-gray-500 text-xs truncate max-w-md group-hover:text-gray-700"
                  title={l.detail}
                >
                  {l.detail}
                </td>
              </tr>
            ))}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-12 text-center text-gray-400">
                  <Search
                    size={48}
                    className="mb-4 text-gray-200 mx-auto block"
                  />
                  <p>没有符合筛选条件的日志记录</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-blue-500" size={24} />
          </div>
        )}
      </div>
      <div className="p-2 border-t bg-gray-50 text-xs text-gray-400 text-right flex justify-end items-center px-4">
        <span className="mr-4">当前展示 {logs.length} 条</span>
        <span>共 {total} 条总记录</span>
      </div>
    </div>
  );
};
