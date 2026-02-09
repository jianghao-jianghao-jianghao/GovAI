
import React, { useState } from 'react';
import { 
  ShieldAlert, User, LayoutDashboard, Calendar, Search
} from 'lucide-react';
import { db } from '../db';

export const AuditLogView = () => {
    const [logs, setLogs] = useState(db.data.auditLogs);
    const [filterUser, setFilterUser] = useState('');
    const [filterModule, setFilterModule] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const filteredLogs = db.data.auditLogs.filter(log => {
        const matchUser = !filterUser || log.user.toLowerCase().includes(filterUser.toLowerCase());
        const matchModule = !filterModule || log.module.toLowerCase().includes(filterModule.toLowerCase());
        
        let matchTime = true;
        const logTime = new Date(log.time).getTime();
        
        if (startDate) {
            const start = new Date(startDate).getTime();
            if (logTime < start) matchTime = false;
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (logTime > end.getTime()) matchTime = false;
        }
    
        return matchUser && matchModule && matchTime;
    });
    
    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b bg-gray-50 flex flex-wrap gap-4 items-center justify-between">
                <div className="font-bold text-gray-700 flex items-center"><ShieldAlert size={18} className="mr-2"/> 系统审计日志</div>
                <div className="flex gap-2 items-center flex-wrap">
                    <div className="flex items-center space-x-2 bg-white border rounded-md px-2 py-1 shadow-sm">
                        <User size={14} className="text-gray-400"/>
                        <input className="text-xs outline-none w-24 bg-transparent" placeholder="筛选用户..." value={filterUser} onChange={e=>setFilterUser(e.target.value)}/>
                    </div>
                    <div className="flex items-center space-x-2 bg-white border rounded-md px-2 py-1 shadow-sm">
                        <LayoutDashboard size={14} className="text-gray-400"/>
                        <input className="text-xs outline-none w-24 bg-transparent" placeholder="筛选模块..." value={filterModule} onChange={e=>setFilterModule(e.target.value)}/>
                    </div>
                    <div className="flex items-center space-x-1 text-xs text-gray-600 bg-white border rounded-md px-2 py-1 shadow-sm">
                        <Calendar size={14} className="text-gray-400 mr-1"/>
                        <input type="date" className="outline-none bg-transparent w-24" value={startDate} onChange={e=>setStartDate(e.target.value)}/>
                        <span className="text-gray-400">-</span>
                        <input type="date" className="outline-none bg-transparent w-24" value={endDate} onChange={e=>setEndDate(e.target.value)}/>
                    </div>
                    <button onClick={() => { setFilterUser(''); setFilterModule(''); setStartDate(''); setEndDate(''); }} className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1 rounded transition-colors">重置筛选</button>
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
                        {filteredLogs.map(l => (
                            <tr key={l.id} className="hover:bg-gray-50 transition-colors group">
                                <td className="p-4 text-gray-500 whitespace-nowrap font-mono text-xs">{new Date(l.time).toLocaleString()}</td>
                                <td className="p-4 font-medium text-gray-800">{l.user}</td>
                                <td className="p-4"><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs border border-gray-200">{l.module}</span></td>
                                <td className="p-4 font-medium text-blue-700">{l.action}</td>
                                <td className="p-4 text-gray-500 text-xs truncate max-w-md group-hover:text-gray-700" title={l.detail}>{l.detail}</td>
                            </tr>
                        ))}
                        {filteredLogs.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-12 text-center text-gray-400 flex flex-col items-center justify-center w-full">
                                    <Search size={48} className="mb-4 text-gray-200"/>
                                    <p>没有符合筛选条件的日志记录</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div className="p-2 border-t bg-gray-50 text-xs text-gray-400 text-right flex justify-end items-center px-4">
               <span className="mr-4">当前展示 {filteredLogs.length} 条</span>
               <span>共 {db.data.auditLogs.length} 条总记录</span>
            </div>
        </div>
    );
};
