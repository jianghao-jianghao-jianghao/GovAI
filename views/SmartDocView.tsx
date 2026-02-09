
import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Sparkles, ChevronRight, Save, BookOpen, FileCheck, 
  CloudUpload, Upload, PenTool, ShieldAlert, Loader2, Search,
  Plus, Trash2, Check, X, ChevronDown, MoreVertical, Edit3,
  Archive, FileInput, FileOutput, CheckCircle, AlertTriangle,
  Layout
} from 'lucide-react';
import { db, hasKbPerm } from '../db';
import { EmptyState, Modal } from '../components/ui';

// --- Smart Doc View ---
export const SmartDocView = ({ toast }) => {
    const [view, setView] = useState('list'); // 'list' | 'create'
    const [activeTab, setActiveTab] = useState('doc'); // 'doc' | 'template'
    
    const [docs, setDocs] = useState([]);
    const [currentDoc, setCurrentDoc] = useState(null);
    const [uploadedFile, setUploadedFile] = useState(null);
    const [processType, setProcessType] = useState('draft'); // draft | check | optimize
    
    // KB Related
    const [selectedKbIds, setSelectedKbIds] = useState([]);
    const [kbCollections, setKbCollections] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // List View State
    const [filters, setFilters] = useState({
        keyword: '',
        startDate: '',
        endDate: '',
        type: '全部',
        security: '全部',
        status: '全部'
    });
    const [selectedDocIds, setSelectedDocIds] = useState(new Set());
    const [activeDropdownId, setActiveDropdownId] = useState(null);
    
    // Modals
    const [showImportModal, setShowImportModal] = useState(false);
    const [importCategory, setImportCategory] = useState('doc'); // Default import category matches tab
    
    const [showOptimizeModal, setShowOptimizeModal] = useState(false);
    const [optimizeTarget, setOptimizeTarget] = useState(null);
    const [selectedOptimizeKb, setSelectedOptimizeKb] = useState('全部知识库');

    // Editor State
    const [step, setStep] = useState(1);
    const [rightPanel, setRightPanel] = useState(null);
    const [materials, setMaterials] = useState([]);
    const [matSearch, setMatSearch] = useState('');
    const [matCategory, setMatCategory] = useState('全部');
    const [reviewResult, setReviewResult] = useState(null);
    const [isAddingMat, setIsAddingMat] = useState(false);
    const [newMat, setNewMat] = useState({ title: '', category: '通用', content: '' });

    // Mock Options
    const KB_MOCK_OPTIONS = ['全部知识库', '综合管理', '人事', '财务', '采购', '信息化', '后勤', '保密', '装备', '训练', '科研'];
    
    useEffect(() => { 
        loadDocs(); 
        setMaterials(db.data.materials);
        const currentUser = db.getCurrentUser();
        const allCols = db.data.kbCollections;
        const permittedCols = allCols.filter(c => hasKbPerm(currentUser, 'ref', c.id));
        setKbCollections(permittedCols);
    }, []);
    
    // Sync Import Category with Active Tab
    useEffect(() => {
        setImportCategory(activeTab);
    }, [activeTab]);

    const loadDocs = () => setDocs(db.getDocs());

    // Filter Logic
    const filteredDocs = useMemo(() => {
        return docs.filter(doc => {
            // 1. Filter by Tab Category (Doc vs Template)
            // Note: If doc_category is missing, default to 'doc'
            const docCat = doc.doc_category || 'doc';
            if (docCat !== activeTab) return false;

            // 2. Standard Filters
            const matchKeyword = doc.title.toLowerCase().includes(filters.keyword.toLowerCase());
            const matchType = filters.type === '全部' || doc.type === filters.type;
            const matchSecurity = filters.security === '全部' || doc.security === filters.security;
            const matchStatus = filters.status === '全部' || doc.status === filters.status;
            
            let matchDate = true;
            if (filters.startDate) {
                matchDate = matchDate && new Date(doc.updated_at) >= new Date(filters.startDate);
            }
            if (filters.endDate) {
                const end = new Date(filters.endDate);
                end.setHours(23,59,59,999);
                matchDate = matchDate && new Date(doc.updated_at) <= end;
            }
            return matchKeyword && matchType && matchSecurity && matchStatus && matchDate;
        });
    }, [docs, filters, activeTab]);
    
    const startCreate = () => { 
        setUploadedFile(null);
        setProcessType('draft');
        setSelectedKbIds([]);
        setReviewResult(null);
        setStep(1); 
        setView('create'); 
    };
    
    const handleFileUpload = (e) => {
        if(e.target.files && e.target.files[0]) {
            setUploadedFile(e.target.files[0]);
        }
    };
    
    // Process Logic (Shared by Create and List Actions)
    const handleProcess = (customDoc = null, customType = null, kbOption = null) => {
        const fileToUse = uploadedFile || (customDoc ? { name: customDoc.title } : null);
        const typeToUse = customType || processType;

        if (!fileToUse && !customDoc) return toast.error("请先上传文档或选择现有文档");
        
        setIsProcessing(true);
        // Simulate Processing Delay
        setTimeout(() => {
            const fileName = fileToUse.name.replace(/\.[^/.]+$/, "");
            let generatedContent = customDoc ? customDoc.content : "";
            let mockReview = null;
            let docTitle = fileName;
            let newStatus = '草稿';

            // Logic branching based on Process Type
            if (typeToUse === 'draft') {
                // "Fill Content" for Templates or "Draft" for new docs
                generatedContent = `${fileName}\n\n    [智能填充内容]\n    根据您选择的模板/大纲，结合${kbOption || '通用知识库'}，已为您补充如下内容：\n\n    一、背景与意义\n    随着业务的不断深入，${fileName}已成为当前工作的重点。\n\n    二、核心目标\n    1. 完善制度体系。\n    2. 提升执行效能。\n\n    特此通知。`;
                docTitle = customDoc?.doc_category === 'template' ? `${fileName} (已填充)` : `${fileName} (AI起草)`;
                newStatus = customDoc?.doc_category === 'template' ? '已补充' : '草稿';
            } else if (typeToUse === 'check') {
                // "Check" for Docs
                generatedContent = customDoc ? customDoc.content : `关于${fileName}的报告\n\n    当前，我们在推进工作中取得了丰功伟迹（注：疑似错别字），但也面临一些挑战。\n\n    虽然时间紧迫，但是（注：语法建议）我们依然按时完成了任务。`;
                docTitle = `${fileName} (已检查)`;
                newStatus = '已检查';
                mockReview = {
                    typos: [{ id: 1, text: '丰功伟迹', suggestion: '丰功伟绩', context: '...取得了丰功伟迹...' }],
                    sensitive: [],
                    grammar: [{ id: 3, text: '虽然...但是', suggestion: '建议删去“但是”', context: '虽然...，但是...' }]
                };
            } else if (typeToUse === 'optimize') {
                // "Optimize" for Docs
                generatedContent = customDoc ? `【优化版本 - 基于${kbOption}】\n\n${customDoc.content}\n\n针对以上内容，结合知识库政策精神，进行了内容润色。` : `${fileName}\n\n    【优化版本】\n\n    针对原稿内容优化如下：\n\n    一、总体要求...`;
                docTitle = `${fileName} (AI优化)`;
                newStatus = '已优化';
            }
    
            const newDoc = { 
                id: customDoc ? customDoc.id : `d_${Date.now()}`, 
                creatorId: db.getCurrentUser().id, 
                title: docTitle, 
                type: customDoc?.type || 'AI生成', 
                status: newStatus, 
                // Inherit category or default to 'doc'. If optimizing a template, it essentially becomes a doc, but let's keep consistency for now.
                doc_category: customDoc?.doc_category || 'doc', 
                content: generatedContent, 
                urgency: customDoc?.urgency || '平件', 
                security: customDoc?.security || '内部', 
                updated_at: new Date().toISOString() 
            };
            
            db.saveDoc(newDoc);
            setCurrentDoc(newDoc);
            if (mockReview) {
                setReviewResult(mockReview);
                setRightPanel('review'); 
            } else {
                setRightPanel(null);
            }
            
            setStep(3);
            setIsProcessing(false);
            if(view === 'list') setView('create'); // Switch view if coming from list
            loadDocs();
            db.logAudit(db.getCurrentUser().id, db.getCurrentUser().username, '智能公文处理', 'SmartDoc', `${typeToUse} - ${fileName}`);
        }, 1500);
    };
    
    const saveDoc = () => { if(!currentDoc) return; const updated = { ...currentDoc, updated_at: new Date().toISOString() }; db.saveDoc(updated); toast.success('公文已保存'); loadDocs(); };
    const insertText = (text) => { if(currentDoc) { setCurrentDoc({ ...currentDoc, content: currentDoc.content + '\n' + text }); toast.success('已插入光标处'); } };
    const handleSaveMaterial = () => { if(!newMat.title || !newMat.content) return toast.error("标题和内容必填"); db.saveMaterial(newMat); setMaterials([...db.data.materials]); setIsAddingMat(false); setNewMat({ title: '', category: '通用', content: '' }); toast.success("素材已添加"); };
    const handleDeleteMaterial = (e, id) => { e.stopPropagation(); if(confirm('删除此素材？')) { db.deleteMaterial(id); setMaterials([...db.data.materials]); toast.success("已删除"); } };

    // Export Logic
    const exportToCSV = () => {
        // Only export contents of the CURRENT TAB
        const targetDocs = selectedDocIds.size > 0 
            ? filteredDocs.filter(d => selectedDocIds.has(d.id)) // FilteredDocs is already filtered by tab
            : filteredDocs;
        
        if (targetDocs.length === 0) return toast.error("没有可导出的数据");

        const headers = ["标题", "类型", "密级", "状态", "更新时间", "分类"];
        const rows = targetDocs.map(d => [
            d.title, d.type, d.security, d.status, new Date(d.updated_at).toLocaleString(), d.doc_category === 'template' ? '模板' : '公文'
        ]);

        const csvContent = "\ufeff" + [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${activeTab === 'template' ? '模板' : '公文'}_导出_${new Date().toISOString().slice(0,10)}.csv`;
        link.click();
        toast.success(`成功导出 ${targetDocs.length} 条记录`);
    };

    const toggleSelectAll = () => {
        if (selectedDocIds.size === filteredDocs.length) setSelectedDocIds(new Set());
        else setSelectedDocIds(new Set(filteredDocs.map(d => d.id)));
    };

    const toggleSelectOne = (id) => {
        const next = new Set(selectedDocIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedDocIds(next);
    };
    
    if(view === 'list') return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" onClick={() => setActiveDropdownId(null)}>
            {/* Header Area */}
            <div className="p-4 border-b bg-gray-50 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <Archive size={20} className="text-blue-600"/> 我的公文箱
                        </h2>
                        {/* Tabs */}
                        <div className="flex space-x-6 text-sm font-medium pt-1">
                            <button 
                                onClick={() => { setActiveTab('doc'); setSelectedDocIds(new Set()); setFilters({...filters, status: '全部'}); }}
                                className={`pb-1 border-b-2 transition-colors ${activeTab === 'doc' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                                公文 (A类)
                            </button>
                            <button 
                                onClick={() => { setActiveTab('template'); setSelectedDocIds(new Set()); setFilters({...filters, status: '全部'}); }}
                                className={`pb-1 border-b-2 transition-colors ${activeTab === 'template' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                                模板 (B类)
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex gap-2 items-center">
                        <button onClick={() => setShowImportModal(true)} className="px-3 py-1.5 border border-gray-300 bg-white text-gray-700 rounded text-sm flex items-center hover:bg-gray-50">
                            <FileInput size={16} className="mr-2"/> 导入
                        </button>
                        <button onClick={exportToCSV} className="px-3 py-1.5 border border-gray-300 bg-white text-gray-700 rounded text-sm flex items-center hover:bg-gray-50">
                            <FileOutput size={16} className="mr-2"/> 导出
                        </button>
                        {/* 智能公文处理 button removed */}
                    </div>
                </div>

                {/* Filter Toolbar */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="relative col-span-1 lg:col-span-1">
                        <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400"/>
                        <input className="w-full pl-8 pr-2 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-400" placeholder="标题关键词..." value={filters.keyword} onChange={e=>setFilters({...filters, keyword: e.target.value})}/>
                    </div>
                    <div className="flex items-center gap-1 col-span-1 lg:col-span-2">
                        <input type="date" className="w-full p-1.5 border rounded text-xs outline-none" value={filters.startDate} onChange={e=>setFilters({...filters, startDate: e.target.value})}/>
                        <span className="text-gray-400">-</span>
                        <input type="date" className="w-full p-1.5 border rounded text-xs outline-none" value={filters.endDate} onChange={e=>setFilters({...filters, endDate: e.target.value})}/>
                    </div>
                    <select className="p-1.5 border rounded text-xs outline-none bg-white" value={filters.type} onChange={e=>setFilters({...filters, type: e.target.value})}>
                        {['全部', '请示', '报告', '通知', '汇报'].map(t => <option key={t} value={t}>{t === '全部' ? '公文类型：全部' : t}</option>)}
                    </select>
                    <select className="p-1.5 border rounded text-xs outline-none bg-white" value={filters.security} onChange={e=>setFilters({...filters, security: e.target.value})}>
                        {['全部', '公开', '内部', '秘密', '机密'].map(t => <option key={t} value={t}>{t === '全部' ? '密级：全部' : t}</option>)}
                    </select>
                    
                    {/* Status Dropdown - Dynamic based on Tab */}
                    <select className="p-1.5 border rounded text-xs outline-none bg-white" value={filters.status} onChange={e=>setFilters({...filters, status: e.target.value})}>
                        <option value="全部">状态：全部</option>
                        {activeTab === 'doc' ? (
                            <>
                                <option value="草稿">草稿</option>
                                <option value="已检查">已检查</option>
                                <option value="已优化">已优化</option>
                                <option value="已归档">已归档</option>
                            </>
                        ) : (
                            <>
                                <option value="未补充">未补充</option>
                                <option value="已补充">已补充</option>
                                <option value="已归档">已归档</option>
                            </>
                        )}
                    </select>
                </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-white text-gray-500 border-b sticky top-0 z-10">
                        <tr>
                            <th className="p-4 w-10"><input type="checkbox" className="rounded" checked={filteredDocs.length > 0 && selectedDocIds.size === filteredDocs.length} onChange={toggleSelectAll}/></th>
                            <th className="p-4 font-semibold text-xs uppercase tracking-wider">标题</th>
                            <th className="p-4 font-semibold text-xs uppercase tracking-wider">类型</th>
                            <th className="p-4 font-semibold text-xs uppercase tracking-wider">密级</th>
                            <th className="p-4 font-semibold text-xs uppercase tracking-wider">状态</th>
                            <th className="p-4 font-semibold text-xs uppercase tracking-wider">更新时间</th>
                            <th className="p-4 font-semibold text-xs uppercase tracking-wider w-24">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredDocs.map(d => (
                            <tr key={d.id} className={`hover:bg-blue-50/30 group transition-colors ${selectedDocIds.has(d.id) ? 'bg-blue-50/50' : ''}`}>
                                <td className="p-4"><input type="checkbox" className="rounded" checked={selectedDocIds.has(d.id)} onChange={()=>toggleSelectOne(d.id)}/></td>
                                <td className="p-4 font-medium text-gray-800">
                                    <div className="flex items-center">
                                        {activeTab === 'template' ? <Layout size={16} className="mr-2 text-purple-400"/> : <FileText size={16} className="mr-2 text-gray-400 group-hover:text-blue-500 transition-colors"/>}
                                        <span className="cursor-pointer hover:text-blue-600 transition-colors" onClick={()=>{setCurrentDoc(d); setStep(3); setView('create');}}>{d.title}</span>
                                    </div>
                                </td>
                                <td className="p-4"><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[11px]">{d.type}</span></td>
                                <td className="p-4 text-gray-500 text-xs">{d.security}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                        d.status === '已归档' ? 'bg-green-100 text-green-700' : 
                                        d.status === '草稿' ? 'bg-yellow-100 text-yellow-700' : 
                                        d.status === '未补充' ? 'bg-gray-100 text-gray-500' :
                                        d.status === '已补充' ? 'bg-purple-100 text-purple-700' :
                                        'bg-blue-100 text-blue-700'
                                    }`}>
                                        {d.status}
                                    </span>
                                </td>
                                <td className="p-4 text-gray-400 text-xs">{new Date(d.updated_at).toLocaleString()}</td>
                                <td className="p-4 relative">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setActiveDropdownId(activeDropdownId === d.id ? null : d.id); }}
                                        className="p-1.5 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
                                    >
                                        <MoreVertical size={16}/>
                                    </button>
                                    {activeDropdownId === d.id && (
                                        <div className="absolute right-4 top-10 w-32 bg-white border rounded-md shadow-xl z-20 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                                            <button onClick={()=>{setCurrentDoc(d); setStep(3); setView('create');}} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"><Edit3 size={14} className="mr-2"/> 编辑</button>
                                            
                                            {/* Action Dropdown Logic based on Tab */}
                                            {activeTab === 'doc' && (
                                                <>
                                                    <button onClick={()=>{setOptimizeTarget(d); setShowOptimizeModal(true);}} className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-gray-100 flex items-center"><Sparkles size={14} className="mr-2"/> 优化</button>
                                                    <button onClick={()=>{handleProcess(d, 'check');}} className="w-full text-left px-4 py-2 text-sm text-orange-600 hover:bg-gray-100 flex items-center"><ShieldAlert size={14} className="mr-2"/> 检查</button>
                                                </>
                                            )}
                                            
                                            {/* Archive Button */}
                                            <button onClick={()=>{
                                                if(confirm(`确定归档《${d.title}》吗？`)) {
                                                    const updated = { ...d, status: '已归档', updated_at: new Date().toISOString() };
                                                    db.saveDoc(updated);
                                                    loadDocs();
                                                    toast.success('文档已归档');
                                                }
                                            }} className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-gray-100 flex items-center"><Archive size={14} className="mr-2"/> 归档</button>

                                            <div className="h-px bg-gray-100 my-1"></div>
                                            <button onClick={()=>{if(confirm('删除此记录？')){db.deleteDoc(d.id); loadDocs(); toast.success('已删除');}}} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-gray-100 flex items-center"><Trash2 size={14} className="mr-2"/> 删除</button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredDocs.length === 0 && <EmptyState icon={activeTab==='doc'?FileText:Layout} title={activeTab==='doc'?"暂无公文":"暂无模板"} desc={activeTab==='doc'?"请导入公文或新建":"请导入模板文件"} action={null}/>}
            </div>

            {/* Import Modal */}
            {showImportModal && (
                <Modal title="导入文件" onClose={() => setShowImportModal(false)} footer={
                    <button onClick={() => {
                        if(!uploadedFile) return toast.error("请选择文件");
                        const newDoc = {
                            id: `d_${Date.now()}`,
                            title: uploadedFile.name.replace(/\.[^/.]+$/, ""),
                            type: '汇报',
                            // Set category and status based on selection
                            doc_category: importCategory,
                            status: importCategory === 'template' ? '未补充' : '草稿',
                            security: '内部',
                            content: '导入内容（示例）...',
                            updated_at: new Date().toISOString()
                        };
                        db.saveDoc(newDoc);
                        loadDocs();
                        setShowImportModal(false);
                        toast.success(`成功导入为${importCategory==='doc'?'公文':'模板'}`);
                    }} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">确认导入</button>
                }>
                    <div className="space-y-4">
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                            <input type="file" id="import-up" className="hidden" onChange={handleFileUpload}/>
                            <label htmlFor="import-up" className="cursor-pointer">
                                {uploadedFile ? <div className="text-blue-600 font-bold">{uploadedFile.name}</div> : <div className="text-gray-400 flex flex-col items-center"><Upload size={24} className="mb-2"/>点击选择 Word 文件</div>}
                            </label>
                        </div>
                        
                        {/* Category Selection */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-2 block">导入为</label>
                            <div className="flex gap-4">
                                <label className="flex items-center cursor-pointer">
                                    <input type="radio" name="import-cat" checked={importCategory === 'doc'} onChange={()=>setImportCategory('doc')} className="mr-2"/> 公文 (A类)
                                </label>
                                <label className="flex items-center cursor-pointer">
                                    <input type="radio" name="import-cat" checked={importCategory === 'template'} onChange={()=>setImportCategory('template')} className="mr-2"/> 模板 (B类)
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-gray-500 mb-1 block">公文类型</label><select className="w-full border p-2 rounded text-sm"><option>请示</option><option>报告</option><option>通知</option><option>汇报</option></select></div>
                            <div><label className="text-xs font-bold text-gray-500 mb-1 block">密级</label><select className="w-full border p-2 rounded text-sm"><option>公开</option><option>内部</option><option>秘密</option><option>机密</option></select></div>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Optimize Modal */}
            {showOptimizeModal && (
                <Modal title="智能优化配置" onClose={() => setShowOptimizeModal(false)} size="sm" footer={
                    <button onClick={() => { setShowOptimizeModal(false); handleProcess(optimizeTarget, 'optimize', selectedOptimizeKb); }} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium">确认优化</button>
                }>
                    <div className="space-y-4">
                        <div className="p-3 bg-blue-50 border border-blue-100 rounded text-xs text-blue-700">
                            即将针对<b>《{optimizeTarget?.title}》</b>进行内容优化，请选择引用的知识库范围。
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-2 block">引用知识库</label>
                            <select 
                                className="w-full border p-2 rounded text-sm bg-white outline-none focus:ring-1 focus:ring-blue-400"
                                value={selectedOptimizeKb}
                                onChange={(e) => setSelectedOptimizeKb(e.target.value)}
                            >
                                <option value="ALL">ALL (全部)</option>
                                {KB_MOCK_OPTIONS.slice(1).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                        <p className="text-[10px] text-gray-400 italic">* 选择 ALL (全部) 将联合检索系统全量合规条文。</p>
                    </div>
                </Modal>
            )}
        </div>
    );
    
    // Editor View (Reused for both Docs and Templates)
    return (
        <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="h-16 border-b flex items-center justify-between px-4 bg-gray-50 shrink-0">
                <div className="flex items-center space-x-3">
                    <button onClick={()=>{setView('list'); loadDocs();}} className="p-2 hover:bg-gray-200 rounded text-gray-500"><ChevronRight size={20} className="rotate-180"/></button>
                    <div className="flex flex-col">
                        <span className="font-bold text-gray-800 text-sm">{step === 1 ? '公文智能处理中心' : currentDoc?.title}</span>
                        {step === 3 && (
                            <span className={`text-[10px] px-1 rounded w-fit ${currentDoc?.doc_category === 'template' ? 'bg-purple-100 text-purple-600' : 'bg-yellow-100 text-gray-500'}`}>
                                {currentDoc?.doc_category === 'template' ? '模板填充模式' : 'AI 辅助编辑中'}
                            </span>
                        )}
                    </div>
                </div>
                {step === 3 && (
                    <div className="flex items-center space-x-2">
                        <button onClick={()=>setRightPanel(rightPanel==='material' ? null : 'material')} className={`p-2 rounded ${rightPanel==='material'?'bg-blue-100 text-blue-600':'hover:bg-gray-200 text-gray-600'}`} title="素材库"><BookOpen size={18}/></button>
                        <button onClick={()=>setRightPanel(rightPanel==='review' ? null : 'review')} className={`p-2 rounded ${rightPanel==='review'?'bg-blue-100 text-blue-600':'hover:bg-gray-200 text-gray-600'}`} title="智能审查结果"><FileCheck size={18}/></button>
                        <div className="h-6 w-px bg-gray-300 mx-1"></div>
                        <button onClick={saveDoc} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 shadow-sm flex items-center"><Save size={16} className="mr-1"/> 保存</button>
                    </div>
                )}
            </div>
            
            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 overflow-auto bg-slate-100 p-8 flex justify-center">
                    
                    {step === 1 && (
                        <div className="w-full max-w-2xl bg-white p-10 rounded-2xl shadow-sm h-fit space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"><CloudUpload size={32}/></div>
                                <h2 className="text-2xl font-bold text-gray-800">智能公文处理中心</h2>
                                <p className="text-gray-500 mt-2 text-sm">上传 Word 文档，AI 将协助您完成起草、检查与优化</p>
                            </div>
    
                            <div className="space-y-6">
                                <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${uploadedFile ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'}`}>
                                    <input type="file" accept=".docx,.doc" onChange={handleFileUpload} className="hidden" id="doc-upload"/>
                                    <label htmlFor="doc-upload" className="cursor-pointer block w-full h-full">
                                        {uploadedFile ? (
                                            <div className="flex flex-col items-center text-green-700">
                                                <FileText size={48} className="mb-2"/>
                                                <span className="font-bold text-lg">{uploadedFile.name}</span>
                                                <span className="text-xs mt-1">{(uploadedFile.size/1024).toFixed(1)} KB - 点击更换</span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center text-gray-500">
                                                <Upload size={32} className="mb-2"/>
                                                <span className="font-medium">点击上传或拖拽 Word 文档至此</span>
                                                <span className="text-xs mt-1 text-gray-400">支持 .docx, .doc 格式</span>
                                            </div>
                                        )}
                                    </label>
                                </div>
    
                                <div className="grid grid-cols-3 gap-4">
                                    {[
                                        { id: 'draft', label: '起草公文', icon: PenTool, desc: '基于大纲与知识库' },
                                        { id: 'check', label: '检查公文', icon: ShieldAlert, desc: '错别字与敏感词检测' },
                                        { id: 'optimize', label: '优化公文', icon: Sparkles, desc: '内容润色与提升' }
                                    ].map(action => (
                                        <div 
                                            key={action.id} 
                                            onClick={() => setProcessType(action.id)}
                                            className={`p-4 border rounded-xl cursor-pointer transition-all flex flex-col items-center text-center ${processType === action.id ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
                                        >
                                            <action.icon size={24} className="mb-2"/>
                                            <div className="font-bold text-sm">{action.label}</div>
                                            <div className="text-[10px] opacity-70 mt-1">{action.desc}</div>
                                        </div>
                                    ))}
                                </div>
    
                                <button 
                                    onClick={() => handleProcess()} 
                                    disabled={!uploadedFile || isProcessing}
                                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                                >
                                    {isProcessing ? <><Loader2 className="animate-spin mr-2"/> 正在智能处理中...</> : '开始处理'}
                                </button>
                            </div>
                        </div>
                    )}
    
                    {step === 3 && currentDoc && (
                        <div className="w-[800px] h-full bg-white shadow-sm flex flex-col animate-in fade-in duration-300">
                            <textarea 
                                className="flex-1 w-full p-16 resize-none outline-none font-serif text-lg leading-loose text-gray-800" 
                                value={currentDoc.content} 
                                placeholder="内容生成中..." 
                                onChange={(e) => setCurrentDoc({...currentDoc, content: e.target.value})}
                            />
                        </div>
                    )}
                </div>
    
                {step === 3 && rightPanel && (
                    <div className="w-80 bg-white border-l shadow-xl z-10 flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <span className="font-bold text-gray-700 flex items-center">
                                {rightPanel === 'material' && <><BookOpen size={16} className="mr-2"/> 素材库</>}
                                {rightPanel === 'review' && <><FileCheck size={16} className="mr-2"/> 智能审查结果</>}
                            </span>
                            <button onClick={()=>setRightPanel(null)}><X size={18} className="text-gray-400 hover:text-gray-600"/></button>
                        </div>
                        <div className="flex-1 overflow-auto p-4 space-y-4">
                            {rightPanel === 'material' && (!isAddingMat ? <><div className="flex justify-between items-center mb-2"><div className="relative flex-1 mr-2"><input className="w-full border rounded pl-8 pr-2 py-2 text-sm" placeholder="搜索素材..." value={matSearch} onChange={e=>setMatSearch(e.target.value)}/><Search size={14} className="absolute left-2.5 top-3 text-gray-400"/></div><button onClick={()=>setIsAddingMat(true)} className="p-2 bg-blue-50 text-blue-600 rounded border border-blue-100 hover:bg-blue-100"><Plus size={16}/></button></div><div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">{['全部','开头','结尾','过渡','政策'].map(cat => (<button key={cat} onClick={()=>setMatCategory(cat)} className={`px-3 py-1 text-xs rounded-full whitespace-nowrap border ${matCategory===cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>{cat}</button>))}</div><div className="space-y-3">{materials.filter(m => (matCategory === '全部' || m.category === matCategory) && m.title.includes(matSearch)).map(m => (<div key={m.id} className="p-3 border rounded hover:border-blue-400 hover:shadow-sm cursor-pointer group bg-slate-50 relative" onClick={()=>insertText(m.content)}><div className="font-bold text-gray-700 text-xs mb-1 flex justify-between">{m.title}<div className="flex items-center space-x-1"><span className="text-[10px] text-gray-400 bg-white px-1 border rounded">{m.category}</span><Trash2 size={12} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100" onClick={(e)=>handleDeleteMaterial(e, m.id)}/></div></div><div className="text-xs text-gray-600 line-clamp-3 leading-relaxed">{m.content}</div><div className="mt-2 text-[10px] text-blue-600 opacity-0 group-hover:opacity-100 font-bold text-right">点击插入 +</div></div>))}</div></> : <div className="bg-gray-50 p-4 rounded border"><h4 className="font-bold text-gray-700 mb-3 text-sm">新增素材</h4><div className="space-y-3"><div><label className="block text-xs text-gray-500 mb-1">标题</label><input className="w-full border rounded p-2 text-sm" value={newMat.title} onChange={e=>setNewMat({...newMat, title: e.target.value})}/></div><div><label className="block text-xs text-gray-500 mb-1">分类</label><select className="w-full border rounded p-2 text-sm" value={newMat.category} onChange={e=>setNewMat({...newMat, category: e.target.value})}>{['开头','结尾','过渡','政策','通用'].map(c=><option key={c} value={c}>{c}</option>)}</select></div><div><label className="block text-xs text-gray-500 mb-1">内容</label><textarea className="w-full border rounded p-2 text-sm h-24" value={newMat.content} onChange={e=>setNewMat({...newMat, content: e.target.value})}/></div><div className="flex gap-2 pt-2"><button onClick={handleSaveMaterial} className="flex-1 bg-blue-600 text-white py-1.5 rounded text-sm">保存</button><button onClick={()=>setIsAddingMat(false)} className="flex-1 bg-white border text-gray-600 py-1.5 rounded text-sm">取消</button></div></div></div>)}
                            
                            {rightPanel === 'review' && (!reviewResult ? <div className="text-center py-10 text-gray-400 flex flex-col items-center"><CheckCircle size={32} className="mb-2 text-gray-300"/><p>暂无审查结果</p><p className="text-xs mt-1">请尝试使用“检查公文”功能</p></div> : <>
                                <div className="bg-orange-50 border border-orange-200 rounded p-3 text-xs text-orange-800 mb-4 flex items-center"><AlertTriangle size={14} className="mr-2"/> 检测到 {reviewResult.typos.length + reviewResult.sensitive.length + reviewResult.grammar.length} 个潜在问题</div>
                                {reviewResult.typos.length > 0 && <div className="text-xs font-bold text-gray-500 uppercase mb-2">错别字 / 拼写</div>}
                                {reviewResult.typos.map(item => (<div key={item.id} className="p-3 border rounded mb-2 bg-red-50 border-red-100"><div className="text-xs text-gray-500 mb-1">原文：{item.context}</div><div className="flex justify-between items-center"><span className="text-sm font-bold text-red-600 line-through mr-2">{item.text}</span><span className="text-sm font-bold text-green-600">{item.suggestion}</span><button className="text-xs bg-white border px-2 py-1 rounded text-gray-600 hover:text-blue-600" onClick={()=>toast.success('已修正')}>采纳</button></div></div>))}
                                {reviewResult.sensitive.length > 0 && <div className="text-xs font-bold text-gray-500 uppercase mb-2 mt-4">敏感词 / 合规性</div>}
                                {reviewResult.sensitive.map(item => (<div key={item.id} className="p-3 border rounded mb-2 bg-orange-50 border-orange-100"><div className="text-xs text-gray-500 mb-1">建议修改：{item.text}</div><div className="text-sm font-bold text-orange-700">{item.suggestion}</div></div>))}
                                {reviewResult.grammar.length > 0 && <div className="text-xs font-bold text-gray-500 uppercase mb-2 mt-4">语法建议</div>}
                                {reviewResult.grammar.map(item => (<div key={item.id} className="p-3 border rounded mb-2 bg-blue-50 border-blue-100"><div className="text-xs text-gray-500 mb-1">上下文：{item.context}</div><div className="text-sm font-bold text-blue-700">{item.suggestion}</div></div>))}
                            </>)}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
