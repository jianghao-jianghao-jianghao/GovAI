
import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Database, Check, ChevronDown, MessageCircle, 
  BrainCircuit, Network, BookOpen, Save, Loader2, X, Activity, 
  Quote, Send, Trash2, Plus, FileText, ExternalLink, AlertTriangle
} from 'lucide-react';
import { db, hasKbPerm } from '../db';
import { PERMISSIONS } from '../constants';
import { EmptyState, Modal } from '../components/ui';

export const SmartQAView = ({ toast, onNavigateToGraph }) => {
    const [sessions, setSessions] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [citationDrawer, setCitationDrawer] = useState(null);
    const [kbCollections, setKbCollections] = useState([]);
    const [expandedReasoning, setExpandedReasoning] = useState({});
    const [showKbSelect, setShowKbSelect] = useState(false);
    const [quoteText, setQuoteText] = useState(null);
    const [editingQa, setEditingQa] = useState(null); 
    const chatContainerRef = useRef(null);

    useEffect(() => { 
        loadSessions(); 
        const currentUser = db.getCurrentUser();
        const allCols = db.data.kbCollections;
        const permittedCols = allCols.filter(c => hasKbPerm(currentUser, 'ref', c.id));
        setKbCollections(permittedCols); 
    }, []);
    
    useEffect(() => {
        const handleMouseUp = () => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) return;
            if (chatContainerRef.current && chatContainerRef.current.contains(selection.anchorNode)) {
                const text = selection.toString().trim();
                if (text) setQuoteText(text);
            }
        };
        document.addEventListener('mouseup', handleMouseUp);
        return () => document.removeEventListener('mouseup', handleMouseUp);
    }, []);
    
    const user = db.getCurrentUser();
    const canRefQa = user?.permissions.includes(PERMISSIONS.RES_QA_REF);
    const canSaveQa = user?.permissions.includes(PERMISSIONS.RES_QA_FEEDBACK);
    
    const loadSessions = () => {
        const s = db.getSessions();
        setSessions(s);
        if(s.length > 0 && !activeId) setActiveId(s[0].id);
    };
    
    const createSession = () => {
        const defaultKb = kbCollections.length > 0 ? [kbCollections[0].id] : [];
        const newS = { id: `s_${Date.now()}`, userId: db.getCurrentUser().id, title: '新会话', kbIds: defaultKb, qaRef: canRefQa, updated_at: new Date().toISOString(), messages: [] };
        db.saveSession(newS);
        loadSessions();
        setActiveId(newS.id);
    };
    
    const deleteSession = (e, id) => {
        e.stopPropagation();
        if(!confirm('确定删除此会话？')) return;
        const newS = sessions.filter(s => s.id !== id);
        db.data.sessions = newS;
        db.save();
        loadSessions();
        if(activeId === id) setActiveId(newS[0]?.id || null);
    };
    
    const toggleKb = (kbId) => {
        const s = sessions.find(s => s.id === activeId);
        if (!s) return;
        if (kbId === 'SYSTEM_QA_BANK') {
            s.qaRef = !s.qaRef;
        } else {
            const currentIds = s.kbIds || [];
            const newIds = currentIds.includes(kbId) ? currentIds.filter(id => id !== kbId) : [...currentIds, kbId];
            s.kbIds = newIds;
        }
        db.saveSession(s);
        loadSessions();
    };
    
    const handleSaveToQa = (qaData) => {
        db.saveQaPair({
            id: `q_${Date.now()}`,
            question: qaData.question,
            answer: qaData.answer,
            category: qaData.category,
            created_at: new Date().toISOString()
        });
        toast.success("已成功保存至QA库");
        setEditingQa(null);
    };
    
    const handleSend = () => {
        if(!input.trim()) return;
        const blocked = db.data.rules.find(r => r.action === 'block' && input.includes(r.keyword));
        if(blocked) { toast.error(`触发安全拦截：包含敏感词 "${blocked.keyword}"`); return; }
        const warn = db.data.rules.find(r => r.action === 'warn' && input.includes(r.keyword));
        if(warn && !window.confirm(`提示：包含敏感词"${warn.keyword}"，继续吗？`)) return;
        
        const currentSession = sessions.find(s => s.id === activeId);
        const finalContent = quoteText ? `> ${quoteText}\n\n${input}` : input;
        
        const userMsg = { id: `m_${Date.now()}_u`, role: 'user', content: finalContent, timestamp: Date.now() };
        const updatedMsgs = [...(currentSession.messages || []), userMsg];
        const updatedSession = { ...currentSession, messages: updatedMsgs, updated_at: new Date().toISOString(), title: currentSession.messages.length === 0 ? input.slice(0, 15) : currentSession.title };
        db.saveSession(updatedSession);
        loadSessions();
        setInput('');
        setQuoteText(null); 
        setIsStreaming(true);
    
        setTimeout(() => {
            const activeKbNames = kbCollections.filter(k => (currentSession.kbIds || []).includes(k.id)).map(k => k.name);
            if (currentSession.qaRef) activeKbNames.unshift("智能QA库");
            const sourceStr = activeKbNames.length > 0 ? `基于[${activeKbNames.join('、')}]` : '基于通用知识';
            
            // Simulation: Priority Search in QA Bank
            let qaHit = null;
            if (currentSession.qaRef) {
                qaHit = db.data.qaPairs.find(q => input.includes(q.question) || q.question.includes(input));
            }
    
            let content, reasoning, citations;
    
            if (qaHit) {
                content = `针对您的问题“${input}”，在智能QA库中找到以下匹配结果：\n\n${qaHit.answer}`;
                reasoning = `1. **检索策略**: 优先检索智能QA库。\n2. **命中检查**: 发现高置信度匹配项 ID:${qaHit.id}。\n3. **直接输出**: 返回QA库中的标准答案。`;
                citations = [{ title: '智能QA库', type: 'qa', page: 1, quote: qaHit.answer }];
            } else {
                content = `针对您的问题“${input}”，${sourceStr}分析如下：\n\n根据《数据安全法》及相关规定，数据分类分级是数据安全保护的基石。建立数据分类分级保护制度，应当根据数据在经济社会发展中的重要程度，以及一旦遭到篡改、破坏、泄露或者非法获取、非法利用，对国家安全、公共利益或者个人、组织合法权益造成的危害程度，对数据实行分类分级保护。`;
                reasoning = `1. **意图识别**: 用户询问关于"${input}"的内容。\n2. **QA检索**: 未在QA库中找到匹配项。\n3. **文档检索**: 在[${activeKbNames.join(',')}]中检索相关文档。\n4. **实体链接**: 识别实体"数据安全"、"分类分级"。\n5. **逻辑推理**: 根据《数据安全法》第二十一条，确认分类分级是法定要求。`;
                citations = [{ title: '数据安全法.pdf', type: 'kb', page: 12, quote: '第二十一条 国家建立数据分类分级保护制度...' }];
            }
    
            const aiMsg = { 
                id: `m_${Date.now()}_a`, 
                role: 'assistant', 
                content: content, 
                timestamp: Date.now(),
                citations: citations,
                reasoning: reasoning,
                knowledgeGraph: !qaHit ? [
                    { source: input.slice(0,4) || '核心概念', target: '数据安全法', relation: '依据' },
                    { source: '数据安全法', target: '分类分级制度', relation: '包含' },
                    { source: '分类分级', target: '国家安全', relation: '影响' }
                ] : null
            };
            updatedSession.messages.push(aiMsg);
            db.saveSession(updatedSession);
            loadSessions();
            setIsStreaming(false);
            setExpandedReasoning(prev => ({...prev, [aiMsg.id]: true}));
        }, 1500);
    };
    
    const activeSession = sessions.find(s => s.id === activeId);
    
    const QaModal = ({ initialQ, initialA, onSave, onClose }) => {
        const [q, setQ] = useState(initialQ);
        const [a, setA] = useState(initialA);
        const [cat, setCat] = useState('Chat Feedback');
        return (
            <Modal title="存入智能QA库" onClose={onClose} footer={<button onClick={()=>onSave({question:q, answer:a, category:cat})} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">保存</button>}>
                <div className="space-y-4">
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">问题</label><textarea className="w-full border rounded p-2 text-sm h-20" value={q} onChange={e=>setQ(e.target.value)}/></div>
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">答案</label><textarea className="w-full border rounded p-2 text-sm h-32" value={a} onChange={e=>setA(e.target.value)}/></div>
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">分类</label><input className="w-full border rounded p-2 text-sm" value={cat} onChange={e=>setCat(e.target.value)}/></div>
                    <div className="bg-yellow-50 p-2 rounded text-xs text-yellow-700 flex items-center"><AlertTriangle size={12} className="mr-1"/> 保存后，该问答对将在后续问答中被优先检索。</div>
                </div>
            </Modal>
        );
    };
    
    return (
        <div className="flex h-full gap-4 relative">
            <div className="w-64 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <span className="font-bold text-gray-700">历史会话</span>
                    <button onClick={createSession} className="p-1 hover:bg-gray-200 rounded"><Plus size={16}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {sessions.map(s => (
                        <div key={s.id} onClick={() => setActiveId(s.id)} className={`group p-3 rounded-lg text-sm cursor-pointer flex justify-between items-center ${activeId === s.id ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}`}>
                            <span className="truncate flex-1">{s.title}</span>
                            <Trash2 size={14} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500" onClick={(e)=>deleteSession(e, s.id)}/>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col relative overflow-hidden">
                {activeSession ? (
                    <>
                        <div className="h-14 border-b flex items-center justify-between px-6 bg-slate-50">
                            <div className="flex flex-col">
                                <div className="font-bold text-gray-700 truncate max-w-md text-sm">{activeSession.title}</div>
                                <div className="text-[10px] text-gray-500 flex items-center"><Activity size={10} className="mr-1 text-green-500"/> RAG 增强检索</div>
                            </div>
                            <div className="flex items-center space-x-2 relative">
                                <button onClick={() => setShowKbSelect(!showKbSelect)} className="flex items-center text-xs border rounded px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors">
                                    <Database size={12} className="mr-2 text-blue-600"/><span>{(activeSession.kbIds || []).length + (activeSession.qaRef ? 1 : 0) > 0 ? `已选 ${(activeSession.kbIds?.length || 0) + (activeSession.qaRef ? 1 : 0)} 个知识源` : '选择知识库'}</span><ChevronDown size={12} className="ml-2 text-gray-400"/>
                                </button>
                                {showKbSelect && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setShowKbSelect(false)}></div>
                                        <div className="absolute top-full right-0 mt-2 w-56 bg-white border rounded-lg shadow-xl z-20 p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div className="text-xs font-bold text-gray-500 px-2 py-1 mb-1">结构化知识</div>
                                            {canRefQa && (
                                                <div className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors" onClick={() => toggleKb('SYSTEM_QA_BANK')}>
                                                    <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${activeSession.qaRef ? 'bg-purple-600 border-purple-600' : 'border-gray-300'}`}>{activeSession.qaRef && <Check size={10} className="text-white"/>}</div>
                                                    <span className="text-sm text-gray-700 flex items-center"><MessageCircle size={12} className="mr-1 text-purple-500"/> 智能QA库</span>
                                                </div>
                                            )}
                                            <div className="text-xs font-bold text-gray-500 px-2 py-1 mt-2 mb-1">文档集合</div>
                                            {kbCollections.map(kb => (
                                                <div key={kb.id} className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors" onClick={() => toggleKb(kb.id)}>
                                                    <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${(activeSession.kbIds || []).includes(kb.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>{(activeSession.kbIds || []).includes(kb.id) && <Check size={10} className="text-white"/>}</div>
                                                    <span className="text-sm text-gray-700">{kb.name}</span>
                                                </div>
                                            ))}
                                            {kbCollections.length === 0 && <div className="p-2 text-xs text-gray-400 text-center">暂无可用知识库</div>}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50/50" ref={chatContainerRef}>
                            {activeSession.messages.map((m, idx) => (
                                <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border border-gray-200 rounded-tl-none'}`}>
                                        {m.role === 'assistant' && m.reasoning && (
                                            <div className="mb-3 border-b border-gray-100 pb-2">
                                                <div className="flex items-center text-xs text-orange-600 cursor-pointer hover:text-orange-700 font-medium" onClick={() => setExpandedReasoning(prev => ({...prev, [m.id]: !prev[m.id]}))}>
                                                    <BrainCircuit size={12} className="mr-1.5"/> {expandedReasoning[m.id] ? '收起推理过程' : '查看推理过程'} <ChevronDown size={12} className={`ml-1 transition-transform ${expandedReasoning[m.id] ? 'rotate-180' : ''}`}/>
                                                </div>
                                                {expandedReasoning[m.id] && <div className="mt-2 text-xs text-gray-600 bg-orange-50 p-2 rounded whitespace-pre-wrap leading-relaxed border border-orange-100 font-mono">{m.reasoning}</div>}
                                            </div>
                                        )}
                                        <div className="whitespace-pre-wrap text-sm leading-relaxed selection:bg-yellow-200 selection:text-black">
                                            {m.content.startsWith('> ') ? <><div className="border-l-4 border-white/50 pl-3 py-1 mb-2 text-white/80 italic text-xs bg-black/10 rounded-r">{m.content.split('\n\n')[0].substring(2)}</div><div>{m.content.substring(m.content.indexOf('\n\n') + 2)}</div></> : m.content}
                                        </div>
                                        {(m.citations || m.knowledgeGraph) && m.role === 'assistant' && (
                                            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col gap-3">
                                                {m.knowledgeGraph && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {m.knowledgeGraph.map((kg, kgi) => (
                                                            <div key={kgi} onClick={() => onNavigateToGraph(kg.source)} className="flex items-center text-[10px] bg-purple-50 text-purple-700 border border-purple-100 rounded-full px-2 py-1 cursor-pointer hover:bg-purple-100 hover:scale-105 transition-all shadow-sm" title="点击跳转到知识图谱">
                                                                <Network size={10} className="mr-1"/><span className="font-bold">{kg.source}</span><span className="mx-1 text-gray-400">-{kg.relation}-></span><span className="font-bold">{kg.target}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {m.citations && (
                                                    <div className="flex flex-wrap gap-2">
                                                        {m.citations.map((c, i) => (
                                                            <button key={i} onClick={() => setCitationDrawer(c)} className={`text-[10px] border rounded px-2 py-1 flex items-center transition-colors ${c.type === 'qa' ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-100'}`}>
                                                                {c.type === 'qa' ? <MessageCircle size={10} className="mr-1"/> : <BookOpen size={10} className="mr-1"/>} 
                                                                {c.title}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                {canSaveQa && (
                                                    <div className="flex justify-end mt-1">
                                                        <button onClick={() => {
                                                            const userQ = sessions.find(s=>s.id===activeId)?.messages.slice(0, sessions.find(s=>s.id===activeId).messages.findIndex(msg => msg.id === m.id)).reverse().find(msg => msg.role === 'user');
                                                            setEditingQa({ question: userQ?.content.replace(/^> .*?\n\n/s, '') || '', answer: m.content });
                                                        }} className="text-[10px] text-gray-400 hover:text-blue-600 flex items-center transition-colors">
                                                            <Save size={12} className="mr-1"/> 存入QA库
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {isStreaming && <div className="text-gray-400 text-sm italic ml-4 flex items-center"><Loader2 className="animate-spin mr-2" size={14}/> 正在分析意图并检索知识库...</div>}
                        </div>
                        <div className="p-4 bg-white border-t">
                            {quoteText && (
                                <div className="mb-2 p-3 bg-gray-50 border-l-4 border-blue-500 rounded-r-lg flex justify-between items-start animate-in slide-in-from-bottom-2">
                                    <div className="flex-1 mr-4"><div className="flex items-center text-xs font-bold text-gray-500 mb-1"><Quote size={12} className="mr-1"/> 引用内容</div><div className="text-sm text-gray-800 line-clamp-3 italic">"{quoteText}"</div></div>
                                    <button onClick={() => setQuoteText(null)} className="text-gray-400 hover:text-red-500 p-1 hover:bg-gray-200 rounded transition-colors"><X size={14}/></button>
                                </div>
                            )}
                            <div className="relative">
                                <input className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder={quoteText ? "请输入针对引用内容的追问..." : (activeSession.kbIds && activeSession.kbIds.length > 0 ? `正在向 ${(activeSession.kbIds.length) + (activeSession.qaRef?1:0)} 个知识库提问...` : "请输入问题...")} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter' && handleSend()} />
                                <button onClick={handleSend} disabled={!input.trim()} className="absolute right-3 top-3 text-blue-600 hover:text-blue-700 disabled:opacity-50"><Send size={20}/></button>
                            </div>
                        </div>
                    </>
                ) : (
                    <EmptyState icon={MessageSquare} title="暂无会话" desc="请点击左侧 + 号新建会话开始问答" action={<button onClick={createSession} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">新建会话</button>} />
                )}
                {citationDrawer && (
                    <div className="absolute inset-y-0 right-0 w-80 bg-white shadow-2xl border-l border-gray-200 z-10 flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50"><h3 className="font-bold text-gray-800">引用详情</h3><button onClick={()=>setCitationDrawer(null)}><X size={18} className="text-gray-400"/></button></div>
                        <div className="p-4 flex-1 overflow-auto">
                            <div className="mb-4"><div className="text-xs text-gray-500 mb-1">来源</div><div className="font-bold text-blue-700 flex items-center">{citationDrawer.type === 'qa' ? <MessageCircle size={14} className="mr-1"/> : <FileText size={14} className="mr-1"/>} {citationDrawer.title}</div></div>
                            <div className="bg-yellow-50 p-3 rounded border border-yellow-100 text-sm text-gray-700 leading-relaxed italic relative"><span className="absolute top-0 left-0 text-4xl text-yellow-200 font-serif leading-none ml-1">“</span><div className="relative z-10">{citationDrawer.quote}</div><div className="mt-2 text-right text-xs text-gray-400">Page {citationDrawer.page}</div></div>
                            {citationDrawer.type !== 'qa' && <button className="w-full mt-6 flex items-center justify-center py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm text-gray-600"><ExternalLink size={14} className="mr-2"/> 打开原文</button>}
                        </div>
                    </div>
                )}
            </div>
            {editingQa && <QaModal initialQ={editingQa.question} initialA={editingQa.answer} onSave={handleSaveToQa} onClose={()=>setEditingQa(null)} />}
        </div>
    );
};
