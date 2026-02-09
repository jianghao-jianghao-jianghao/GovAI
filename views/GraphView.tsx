
import React, { useState, useEffect, useRef } from 'react';
import { 
  Share2, X, MousePointer2, MapPin, Zap, Activity, Navigation
} from 'lucide-react';

export const GraphView = ({ toast, focusNodeId }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [selectedNodeId, setSelectedNodeId] = useState(null);

    const sim = useRef({
        nodes: [],
        links: [],
        camera: { x: 0, y: 0, k: 1, targetX: 0, targetY: 0, targetK: 1 },
        dragging: null,
        dragStart: null as any,
        hover: null,
        selected: null,
        width: 0,
        height: 0,
        lastTime: 0
    }).current;
    
    useEffect(() => {
        const coreNodes = [
            { id: '数据安全', group: 1, val: 25 },
            { id: '数字政府', group: 1, val: 30 },
            { id: '分类分级', group: 2, val: 18 },
            { id: '以人民为中心', group: 3, val: 18 },
            { id: '系统观念', group: 3, val: 15 },
            { id: '数据安全法', group: 2, val: 20 },
            { id: '个人信息保护', group: 2, val: 18 },
            { id: '国家安全', group: 1, val: 22 },
            { id: '风险评估', group: 2, val: 12 },
            { id: '应急响应', group: 4, val: 12 },
            { id: '云平台', group: 4, val: 15 },
            { id: '大数据', group: 4, val: 16 },
            { id: '人工智能', group: 4, val: 20 },
            { id: '一网通办', group: 3, val: 16 },
            { id: '跨省通办', group: 3, val: 14 },
            { id: '电子证照', group: 3, val: 12 }
        ];
    
        const links = [
            { source: '数据安全', target: '分类分级' }, { source: '数据安全', target: '数据安全法' },
            { source: '数据安全', target: '个人信息保护' }, { source: '数据安全', target: '风险评估' },
            { source: '数字政府', target: '以人民为中心' }, { source: '数字政府', target: '系统观念' },
            { source: '数字政府', target: '云平台' }, { source: '数字政府', target: '大数据' },
            { source: '数字政府', target: '一网通办' }, { source: '分类分级', target: '数据安全法' },
            { source: '分类分级', target: '国家安全' }, { source: '国家安全', target: '数据安全' },
            { source: '应急响应', target: '数据安全' }, { source: '人工智能', target: '大数据' },
            { source: '人工智能', target: '数字政府' }, { source: '一网通办', target: '电子证照' },
            { source: '一网通办', target: '跨省通办' }
        ];
    
        sim.nodes = coreNodes.map(n => ({
            ...n,
            x: Math.random() * 800 - 400,
            y: Math.random() * 600 - 300,
            vx: 0, vy: 0,
            fixed: false
        }));
    
        sim.links = links.map(l => ({
            source: sim.nodes.find(n => n.id === l.source),
            target: sim.nodes.find(n => n.id === l.target)
        })).filter(l => l.source && l.target);
    
    }, []);
    
    useEffect(() => {
        if (focusNodeId) {
            const node = sim.nodes.find(n => n.id === focusNodeId);
            if (node) {
                sim.selected = node;
                setSelectedNodeId(node.id);
                sim.camera.targetX = -node.x * sim.camera.targetK;
                sim.camera.targetY = -node.y * sim.camera.targetK;
            }
        }
    }, [focusNodeId]);
    
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationId;
    
        const resize = () => {
            if (containerRef.current) {
                const { clientWidth: w, clientHeight: h } = containerRef.current;
                sim.width = w;
                sim.height = h;
                const dpr = window.devicePixelRatio || 1;
                canvas.width = w * dpr;
                canvas.height = h * dpr;
                canvas.style.width = `${w}px`;
                canvas.style.height = `${h}px`;
                ctx.scale(dpr, dpr);
                if(sim.camera.x === 0 && sim.camera.y === 0) {
                     sim.camera.x = w / 2; sim.camera.y = h / 2;
                     sim.camera.targetX = w / 2; sim.camera.targetY = h / 2;
                }
            }
        };
        window.addEventListener('resize', resize);
        resize();
    
        const render = (time) => {
            const dt = Math.min((time - sim.lastTime) / 1000, 0.05);
            sim.lastTime = time;
    
            sim.camera.x += (sim.camera.targetX - sim.camera.x) * 0.1;
            sim.camera.y += (sim.camera.targetY - sim.camera.y) * 0.1;
            sim.camera.k += (sim.camera.targetK - sim.camera.k) * 0.1;
    
            for (let i = 0; i < sim.nodes.length; i++) {
                for (let j = i + 1; j < sim.nodes.length; j++) {
                    const n1 = sim.nodes[i];
                    const n2 = sim.nodes[j];
                    const dx = n1.x - n2.x;
                    const dy = n1.y - n2.y;
                    const distSq = dx * dx + dy * dy + 1;
                    const f = 5000 / distSq;
                    const dist = Math.sqrt(distSq);
                    const fx = (dx / dist) * f;
                    const fy = (dy / dist) * f;
                    if (!n1.fixed && n1 !== sim.dragging) { n1.vx += fx; n1.vy += fy; }
                    if (!n2.fixed && n2 !== sim.dragging) { n2.vx -= fx; n2.vy -= fy; }
                }
            }
            for (const link of sim.links) {
                const n1 = link.source;
                const n2 = link.target;
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const force = (dist - 150) * 0.05;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                if (!n1.fixed && n1 !== sim.dragging) { n1.vx += fx; n1.vy += fy; }
                if (!n2.fixed && n2 !== sim.dragging) { n2.vx -= fx; n2.vy -= fy; }
            }
            for (const n of sim.nodes) {
                if (!n.fixed && n !== sim.dragging) {
                    n.vx -= n.x * 0.002;
                    n.vy -= n.y * 0.002;
                    n.vx *= 0.9;
                    n.vy *= 0.9;
                    n.x += n.vx;
                    n.y += n.vy;
                }
            }
    
            const w = sim.width;
            const h = sim.height;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#020617';
            ctx.fillRect(0, 0, w, h);
    
            ctx.save();
            ctx.translate(w / 2, h / 2);
            ctx.translate(sim.camera.x - w/2, sim.camera.y - h/2);
            ctx.setTransform(sim.camera.k * (window.devicePixelRatio||1), 0, 0, sim.camera.k * (window.devicePixelRatio||1), sim.camera.x * (window.devicePixelRatio||1), sim.camera.y * (window.devicePixelRatio||1));
    
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1 / sim.camera.k;
            ctx.beginPath();
            const gridSize = 100;
            const viewL = (-sim.camera.x) / sim.camera.k - w/sim.camera.k;
            const viewR = (-sim.camera.x) / sim.camera.k + w/sim.camera.k + w;
            const viewT = (-sim.camera.y) / sim.camera.k - h/sim.camera.k;
            const viewB = (-sim.camera.y) / sim.camera.k + h/sim.camera.k + h;
            for (let x = Math.floor(viewL/gridSize)*gridSize; x < viewR; x += gridSize) { ctx.moveTo(x, viewT); ctx.lineTo(x, viewB); }
            for (let y = Math.floor(viewT/gridSize)*gridSize; y < viewB; y += gridSize) { ctx.moveTo(viewL, y); ctx.lineTo(viewR, y); }
            ctx.globalAlpha = 0.2;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
    
            for (const link of sim.links) {
                const isHighlight = sim.selected && (sim.selected === link.source || sim.selected === link.target);
                ctx.beginPath();
                ctx.moveTo(link.source.x, link.source.y);
                ctx.lineTo(link.target.x, link.target.y);
                ctx.strokeStyle = isHighlight ? '#38bdf8' : '#334155';
                ctx.lineWidth = (isHighlight ? 2 : 1) / sim.camera.k;
                ctx.globalAlpha = isHighlight ? 0.8 : 0.4;
                ctx.stroke();
                
                if (true) {
                    const offset = (time / 1000 * 60 + (link.source.x+link.target.y)) % 100;
                    const t = offset / 100;
                    const px = link.source.x + (link.target.x - link.source.x) * t;
                    const py = link.source.y + (link.target.y - link.source.y) * t;
                    ctx.beginPath();
                    ctx.arc(px, py, 3 / sim.camera.k, 0, Math.PI * 2);
                    ctx.fillStyle = '#0ea5e9';
                    ctx.globalAlpha = 1;
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1.0;
    
            for (const n of sim.nodes) {
                const isHover = n === sim.hover;
                const isSelected = n === sim.selected;
                if (isSelected) {
                     ctx.beginPath();
                     ctx.arc(n.x, n.y, n.val + 10 + Math.sin(time/200)*5, 0, Math.PI * 2);
                     ctx.fillStyle = 'rgba(14, 165, 233, 0.3)';
                     ctx.fill();
                }
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.val, 0, Math.PI * 2);
                if (n.group === 1) ctx.fillStyle = '#3b82f6';
                else if (n.group === 2) ctx.fillStyle = '#10b981';
                else if (n.group === 3) ctx.fillStyle = '#f59e0b';
                else ctx.fillStyle = '#8b5cf6';
                ctx.fill();
                ctx.strokeStyle = n.fixed ? '#ef4444' : (isSelected ? '#fff' : '#cbd5e1');
                ctx.lineWidth = (n.fixed || isSelected ? 3 : 1) / sim.camera.k;
                ctx.stroke();
                if (sim.camera.k > 0.5 || isSelected || isHover) {
                    ctx.fillStyle = '#f8fafc';
                    ctx.font = `${isSelected ? 'bold ' : ''}${12 / sim.camera.k}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(n.id, n.x, n.y + n.val + 10/sim.camera.k);
                }
            }
            ctx.restore();
            animationId = requestAnimationFrame(render);
        };
        animationId = requestAnimationFrame(render);
        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationId);
        };
    }, []);
    
    const getWorldPos = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldX = (screenX - sim.camera.x) / sim.camera.k;
        const worldY = (screenY - sim.camera.y) / sim.camera.k;
        return { x: worldX, y: worldY };
    };
    
    const handleMouseDown = (e) => {
        const pos = getWorldPos(e);
        const hitNode = sim.nodes.find(n => {
            const dx = n.x - pos.x;
            const dy = n.y - pos.y;
            return Math.sqrt(dx*dx + dy*dy) < n.val + 5/sim.camera.k;
        });
    
        if (hitNode) {
            sim.dragging = hitNode;
            sim.dragging.fixed = true;
            sim.selected = hitNode;
            setSelectedNodeId(hitNode.id);
        } else {
            sim.dragging = 'camera';
            sim.dragStart = { x: e.clientX, y: e.clientY, camX: sim.camera.x, camY: sim.camera.y };
        }
    };
    
    const handleMouseMove = (e) => {
        const pos = getWorldPos(e);
        const hitNode = sim.nodes.find(n => {
            const dx = n.x - pos.x;
            const dy = n.y - pos.y;
            return Math.sqrt(dx*dx + dy*dy) < n.val + 5/sim.camera.k;
        });
        sim.hover = hitNode || null;
        canvasRef.current.style.cursor = hitNode ? 'pointer' : (sim.dragging === 'camera' ? 'grabbing' : 'default');
    
        if (sim.dragging && sim.dragging !== 'camera') {
            sim.dragging.x = pos.x;
            sim.dragging.y = pos.y;
            sim.dragging.vx = 0; sim.dragging.vy = 0;
        } else if (sim.dragging === 'camera') {
            const dx = e.clientX - sim.dragStart.x;
            const dy = e.clientY - sim.dragStart.y;
            sim.camera.x = sim.dragStart.camX + dx;
            sim.camera.y = sim.dragStart.camY + dy;
            sim.camera.targetX = sim.camera.x;
            sim.camera.targetY = sim.camera.y;
        }
    };
    
    const handleMouseUp = () => { sim.dragging = null; };
    
    const handleWheel = (e) => {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        const newK = Math.min(Math.max(0.1, sim.camera.k + delta), 5);
        const rect = canvasRef.current.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldPos = getWorldPos(e);
        sim.camera.targetK = newK;
        sim.camera.targetX = screenX - worldPos.x * newK;
        sim.camera.targetY = screenY - worldPos.y * newK;
    };
    
    return (
        <div ref={containerRef} className="h-full w-full bg-[#020617] relative overflow-hidden flex shadow-inner">
            <canvas ref={canvasRef} className="block outline-none" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel} />
            <div className={`absolute top-4 right-4 w-80 bg-slate-900/90 backdrop-blur border border-slate-700 text-slate-200 p-6 rounded-xl shadow-2xl transition-all duration-300 transform ${selectedNodeId ? 'translate-x-0 opacity-100' : 'translate-x-[120%] opacity-0'}`}>
                <div className="flex justify-between items-start mb-4"><h3 className="text-xl font-bold text-white flex items-center"><Share2 size={20} className="mr-2 text-blue-400"/>{selectedNodeId}</h3><button onClick={() => { sim.selected = null; setSelectedNodeId(null); }} className="text-slate-400 hover:text-white"><X size={18}/></button></div>
                <div className="space-y-4">
                    <div className="p-3 bg-slate-800 rounded border border-slate-700"><div className="text-xs text-slate-400 uppercase font-bold mb-1">操作指南</div><div className="text-xs text-gray-400 space-y-1"><div className="flex items-center"><MousePointer2 size={12} className="mr-2"/> 拖拽节点可固定位置 (红色描边)</div><div className="flex items-center"><MapPin size={12} className="mr-2"/> 当前节点已锁定，再次拖动更新位置</div></div></div>
                    <div className="pt-2 border-t border-slate-700">{sim.selected && sim.selected.fixed ? (<button onClick={() => { sim.selected.fixed = false; }} className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold text-sm transition-all flex items-center justify-center"><Zap size={14} className="mr-2 text-yellow-400"/> 解除固定 (Unpin)</button>) : (<div className="text-center text-xs text-gray-500 italic">节点自由浮动中</div>)}</div>
                </div>
            </div>
            <div className="absolute top-4 left-4 flex space-x-2 pointer-events-none">
                 <div className="bg-slate-900/80 backdrop-blur border border-slate-700 text-cyan-400 text-xs px-3 py-1 rounded font-mono flex items-center"><Activity size={12} className="mr-2 animate-pulse"/>LIVE</div>
                 <div className="bg-slate-900/80 backdrop-blur border border-slate-700 text-purple-400 text-xs px-3 py-1 rounded font-mono">SIM: ACTIVE</div>
                 <div className="bg-slate-900/80 backdrop-blur border border-slate-700 text-emerald-400 text-xs px-3 py-1 rounded font-mono flex items-center"><Navigation size={12} className="mr-2"/>CAM: {sim.camera.k.toFixed(2)}x</div>
            </div>
        </div>
    );
};
