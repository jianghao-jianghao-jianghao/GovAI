/**
 * 知识图谱 2D 高级可视化
 *
 * 纯 Canvas 渲染，力导向布局
 * 视觉特效：辉光节点 · 流光粒子边 · 呼吸光环 · 网格深空背景
 * 功能：搜索 · 编辑 · 删除 · 批量删除
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Search,
  X,
  Pencil,
  Trash2,
  CheckSquare,
  Save,
  RotateCcw,
  Activity,
  Eye,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import {
  apiGetGraphNodes,
  apiGetGraphEdges,
  apiSearchGraphNodes,
  apiUpdateGraphNode,
  apiDeleteGraphNode,
  apiDeleteGraphNodes,
  GraphNode,
  GraphEdge,
} from "../api/graph";
import { PERMISSIONS } from "../constants";
import { useConfirm } from "../components/ui";

/* ═══════════════════ 颜色系统 ═══════════════════ */

const TYPE_PALETTE: Record<
  string,
  { fill: string; glow: string; text: string }
> = {
  人物: { fill: "#3b82f6", glow: "#3b82f680", text: "#93c5fd" },
  组织: { fill: "#10b981", glow: "#10b98180", text: "#6ee7b7" },
  地点: { fill: "#f59e0b", glow: "#f59e0b80", text: "#fcd34d" },
  事件: { fill: "#ef4444", glow: "#ef444480", text: "#fca5a5" },
  概念: { fill: "#8b5cf6", glow: "#8b5cf680", text: "#c4b5fd" },
  文档: { fill: "#ec4899", glow: "#ec489980", text: "#f9a8d4" },
  法规: { fill: "#06b6d4", glow: "#06b6d480", text: "#67e8f9" },
  时间: { fill: "#f97316", glow: "#f9731680", text: "#fdba74" },
  default: { fill: "#6366f1", glow: "#6366f180", text: "#a5b4fc" },
};

function palette(type: string) {
  return TYPE_PALETTE[type] || TYPE_PALETTE.default;
}

/* ═══════════════════ Fallback 演示数据 ═══════════════════ */

const FALLBACK_NODES: GraphNode[] = [
  { id: "d1", name: "国务院", entity_type: "组织", weight: 22, created_at: "" },
  {
    id: "d2",
    name: "公文管理办法",
    entity_type: "法规",
    weight: 18,
    created_at: "",
  },
  {
    id: "d3",
    name: "信息化建设",
    entity_type: "概念",
    weight: 16,
    created_at: "",
  },
  {
    id: "d4",
    name: "数字政务",
    entity_type: "概念",
    weight: 14,
    created_at: "",
  },
  { id: "d5", name: "北京市", entity_type: "地点", weight: 12, created_at: "" },
  { id: "d6", name: "上海市", entity_type: "地点", weight: 12, created_at: "" },
  {
    id: "d7",
    name: "人工智能",
    entity_type: "概念",
    weight: 17,
    created_at: "",
  },
  { id: "d8", name: "大数据", entity_type: "概念", weight: 15, created_at: "" },
  {
    id: "d9",
    name: "国家发改委",
    entity_type: "组织",
    weight: 18,
    created_at: "",
  },
  {
    id: "d10",
    name: "科技部",
    entity_type: "组织",
    weight: 14,
    created_at: "",
  },
  {
    id: "d11",
    name: "深圳市",
    entity_type: "地点",
    weight: 13,
    created_at: "",
  },
  {
    id: "d12",
    name: "云计算",
    entity_type: "概念",
    weight: 14,
    created_at: "",
  },
  {
    id: "d13",
    name: "网络安全法",
    entity_type: "法规",
    weight: 15,
    created_at: "",
  },
  {
    id: "d14",
    name: "数据安全",
    entity_type: "概念",
    weight: 13,
    created_at: "",
  },
  {
    id: "d15",
    name: "智慧城市",
    entity_type: "概念",
    weight: 16,
    created_at: "",
  },
  {
    id: "d16",
    name: "区块链",
    entity_type: "概念",
    weight: 12,
    created_at: "",
  },
];

const FALLBACK_EDGES: GraphEdge[] = [
  {
    id: "e1",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "发布",
    source_name: "国务院",
    target_name: "公文管理办法",
  },
  {
    id: "e2",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "推动",
    source_name: "国务院",
    target_name: "信息化建设",
  },
  {
    id: "e3",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "包含",
    source_name: "信息化建设",
    target_name: "数字政务",
  },
  {
    id: "e4",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "所在地",
    source_name: "国务院",
    target_name: "北京市",
  },
  {
    id: "e5",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "应用",
    source_name: "数字政务",
    target_name: "人工智能",
  },
  {
    id: "e6",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "依赖",
    source_name: "人工智能",
    target_name: "大数据",
  },
  {
    id: "e7",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "主管",
    source_name: "国家发改委",
    target_name: "信息化建设",
  },
  {
    id: "e8",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "合作",
    source_name: "科技部",
    target_name: "人工智能",
  },
  {
    id: "e9",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "试点",
    source_name: "上海市",
    target_name: "数字政务",
  },
  {
    id: "e10",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "协作",
    source_name: "国家发改委",
    target_name: "科技部",
  },
  {
    id: "e11",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "试点",
    source_name: "深圳市",
    target_name: "智慧城市",
  },
  {
    id: "e12",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "支撑",
    source_name: "云计算",
    target_name: "数字政务",
  },
  {
    id: "e13",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "发布",
    source_name: "国务院",
    target_name: "网络安全法",
  },
  {
    id: "e14",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "保障",
    source_name: "网络安全法",
    target_name: "数据安全",
  },
  {
    id: "e15",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "赋能",
    source_name: "大数据",
    target_name: "智慧城市",
  },
  {
    id: "e16",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "融合",
    source_name: "区块链",
    target_name: "数据安全",
  },
  {
    id: "e17",
    source_entity_id: "",
    target_entity_id: "",
    relation_type: "基础",
    source_name: "云计算",
    target_name: "大数据",
  },
];

/* ═══════════════════ 力导向节点/边 ═══════════════════ */

interface N {
  id: string; // display name
  bid: string; // backend UUID
  type: string;
  w: number; // weight → radius
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  fixed: boolean;
}

interface L {
  s: N;
  t: N;
  rel: string;
  particles: number[]; // 流光粒子 t 参数 0‥1
}

/* ═══════════════════ 主组件 ═══════════════════ */

export interface GraphFocusRelation {
  sourceName: string;
  targetName: string;
  relation: string;
}

export const GraphView = ({
  toast,
  focusRelation,
  currentUser,
}: {
  toast: {
    success: (t: string) => void;
    error: (t: string) => void;
    info: (t: string) => void;
  };
  focusRelation?: GraphFocusRelation | null;
  currentUser?: { permissions?: string[] };
}) => {
  /* ── 权限 ── */
  const canEdit =
    currentUser?.permissions?.includes(PERMISSIONS.RES_GRAPH_EDIT) ?? false;
  const { confirm, ConfirmDialog } = useConfirm();
  /* ── refs ── */
  const boxRef = useRef<HTMLDivElement>(null!);
  const cvs = useRef<HTMLCanvasElement>(null!);
  const raf = useRef(0);

  /* simulation state (mutable, not React state) */
  const sim = useRef({
    nodes: [] as N[],
    links: [] as L[],
    width: 0,
    height: 0,
    cam: { x: 0, y: 0, k: 1, tx: 0, ty: 0, tk: 1 },
    dragging: null as N | "cam" | null,
    dragStart: { mx: 0, my: 0, cx: 0, cy: 0 },
    hover: null as N | null,
    selected: null as N | null,
    lastTime: 0,
    alpha: 1, // 冷却因子
    mouseWorld: { x: 0, y: 0 },
  });

  /* React state — 仅用于 UI 面板 */
  const [rawNodes, setRawNodes] = useState<GraphNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<Set<string>>(new Set());

  const [batchMode, setBatchMode] = useState(false);
  const [batchSet, setBatchSet] = useState<Set<string>>(new Set());

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editWeight, setEditWeight] = useState(10);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showLabels, setShowLabels] = useState(true);

  /* ── 强调边（从智能问答跳转） ── */
  const [highlightEdge, setHighlightEdge] = useState<{ sourceName: string; targetName: string; relation: string } | null>(null);
  const highlightEdgeRef = useRef(highlightEdge);
  highlightEdgeRef.current = highlightEdge;

  /* ── 创建模拟节点 ── */
  const buildSim = useCallback((nodes: GraphNode[], edges: GraphEdge[]) => {
    const s = sim.current;
    const ns: N[] = nodes.map((n) => {
      const r = Math.max(8, (n.weight || 10) * 1.1);
      return {
        id: n.name,
        bid: n.id,
        type: n.entity_type,
        w: n.weight || 10,
        r,
        x: (Math.random() - 0.5) * 500,
        y: (Math.random() - 0.5) * 400,
        vx: 0,
        vy: 0,
        fixed: false,
      };
    });
    const nm = new Map(ns.map((n) => [n.id, n]));
    const ls: L[] = [];
    for (const e of edges) {
      const a = nm.get(e.source_name),
        b = nm.get(e.target_name);
      if (a && b)
        ls.push({
          s: a,
          t: b,
          rel: e.relation_type,
          particles: [Math.random(), Math.random() * 0.5 + 0.5],
        });
    }
    s.nodes = ns;
    s.links = ls;
    s.alpha = 1;
    // 居中相机
    s.cam = {
      x: s.width / 2,
      y: s.height / 2,
      k: 1,
      tx: s.width / 2,
      ty: s.height / 2,
      tk: 1,
    };
  }, []);

  /* ── 加载数据 ── */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ns, es] = await Promise.all([
        apiGetGraphNodes(),
        apiGetGraphEdges(),
      ]);
      if (ns?.length) {
        setRawNodes(ns);
        buildSim(ns, es || []);
        setLoading(false);
        return;
      }
    } catch {
      /* fallback */
    }
    setRawNodes(FALLBACK_NODES);
    buildSim(FALLBACK_NODES, FALLBACK_EDGES);
    setLoading(false);
  }, [buildSim]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── focusRelation: 强调特定关系边 ── */
  useEffect(() => {
    if (!focusRelation) {
      setHighlightEdge(null);
      return;
    }
    setHighlightEdge(focusRelation);
    // 尝试将相机平移到两个节点的中点
    const s = sim.current;
    const srcNode = s.nodes.find((n) => n.id === focusRelation.sourceName);
    const tgtNode = s.nodes.find((n) => n.id === focusRelation.targetName);
    if (srcNode && tgtNode) {
      const mx = (srcNode.x + tgtNode.x) / 2;
      const my = (srcNode.y + tgtNode.y) / 2;
      s.cam.tx = s.width / 2 - mx * s.cam.tk;
      s.cam.ty = s.height / 2 - my * s.cam.tk;
      // 不逍常模式选中任何节点，仅通过 highlightEdge 强调
      sim.current.selected = null;
      setSelectedId(null);
    } else if (srcNode) {
      s.cam.tx = s.width / 2 - srcNode.x * s.cam.tk;
      s.cam.ty = s.height / 2 - srcNode.y * s.cam.tk;
    }
    s.alpha = Math.max(s.alpha, 0.1); // 唤醒动画
  }, [focusRelation]);

  /* ═══════════ Canvas 渲染循环 ═══════════ */

  useEffect(() => {
    const canvas = cvs.current;
    const ctx = canvas.getContext("2d")!;
    let W = 0,
      H = 0;

    const resize = () => {
      if (!boxRef.current) return;
      W = boxRef.current.clientWidth;
      H = boxRef.current.clientHeight;
      sim.current.width = W;
      sim.current.height = H;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (sim.current.cam.x === 0) {
        sim.current.cam.x = sim.current.cam.tx = W / 2;
        sim.current.cam.y = sim.current.cam.ty = H / 2;
      }
    };
    window.addEventListener("resize", resize);
    resize();

    /* ── 物理 ── */
    const tick = (dt: number) => {
      const s = sim.current;
      if (s.alpha < 0.003) return;
      const a = s.alpha;
      const ns = s.nodes,
        ls = s.links;

      // repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const A = ns[i],
            B = ns[j];
          const dx = A.x - B.x,
            dy = A.y - B.y;
          const d2 = dx * dx + dy * dy + 1;
          const f = (6000 * a) / d2;
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f,
            fy = (dy / d) * f;
          if (!A.fixed && A !== s.dragging) {
            A.vx += fx;
            A.vy += fy;
          }
          if (!B.fixed && B !== s.dragging) {
            B.vx -= fx;
            B.vy -= fy;
          }
        }
      }
      // spring
      for (const l of ls) {
        const dx = l.t.x - l.s.x,
          dy = l.t.y - l.s.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - 140) * 0.04 * a;
        const fx = (dx / d) * f,
          fy = (dy / d) * f;
        if (!l.s.fixed && l.s !== s.dragging) {
          l.s.vx += fx;
          l.s.vy += fy;
        }
        if (!l.t.fixed && l.t !== s.dragging) {
          l.t.vx -= fx;
          l.t.vy -= fy;
        }
      }
      // center + damping
      for (const n of ns) {
        if (n.fixed || n === s.dragging) continue;
        n.vx -= n.x * 0.002 * a;
        n.vy -= n.y * 0.002 * a;
        n.vx *= 0.88;
        n.vy *= 0.88;
        n.x += n.vx;
        n.y += n.vy;
      }
      s.alpha *= 0.998;
    };

    /* ── 渲染 ── */
    const render = (time: number) => {
      const s = sim.current;
      const dt = Math.min((time - s.lastTime) / 1000, 0.05);
      s.lastTime = time;

      tick(dt);

      // 相机平滑
      s.cam.x += (s.cam.tx - s.cam.x) * 0.12;
      s.cam.y += (s.cam.ty - s.cam.y) * 0.12;
      s.cam.k += (s.cam.tk - s.cam.k) * 0.12;

      const k = s.cam.k,
        cx = s.cam.x,
        cy = s.cam.y;

      // ── 清屏 ──
      ctx.save();
      ctx.setTransform(
        window.devicePixelRatio || 1,
        0,
        0,
        window.devicePixelRatio || 1,
        0,
        0,
      );
      // 深空渐变
      const grad = ctx.createRadialGradient(
        W / 2,
        H / 2,
        0,
        W / 2,
        H / 2,
        Math.max(W, H) * 0.8,
      );
      grad.addColorStop(0, "#0c1222");
      grad.addColorStop(0.6, "#060d1b");
      grad.addColorStop(1, "#020617");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // ── 微弱网格 ──
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      const gs = 80;
      const vl = -cx / k - W / k,
        vr = -cx / k + (2 * W) / k;
      const vt = -cy / k - H / k,
        vb = -cy / k + (2 * H) / k;
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 0.5 / k;
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      for (let x = Math.floor(vl / gs) * gs; x < vr; x += gs) {
        ctx.moveTo(x, vt);
        ctx.lineTo(x, vb);
      }
      for (let y = Math.floor(vt / gs) * gs; y < vb; y += gs) {
        ctx.moveTo(vl, y);
        ctx.lineTo(vr, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      const selNode = s.selected;
      const hoverNode = s.hover;
      const hlEdge = highlightEdgeRef.current;
      const t = time / 1000;

      // 判定选中节点的邻居
      const neighborIds = new Set<string>();
      if (selNode) {
        neighborIds.add(selNode.id);
        for (const l of s.links) {
          if (l.s.id === selNode.id) neighborIds.add(l.t.id);
          if (l.t.id === selNode.id) neighborIds.add(l.s.id);
        }
      }
      // 强调边的节点 ID 集合
      const hlNodeIds = new Set<string>();
      if (hlEdge) {
        hlNodeIds.add(hlEdge.sourceName);
        hlNodeIds.add(hlEdge.targetName);
      }

      // ── 绘制边 ──
      for (const l of s.links) {
        const isHl =
          selNode && neighborIds.has(l.s.id) && neighborIds.has(l.t.id);
        // 是否是从智能问答强调的边
        const isFocusEdge = hlEdge
          && l.s.id === hlEdge.sourceName
          && l.t.id === hlEdge.targetName
          && l.rel === hlEdge.relation;
        const isAnyHl = isHl || isFocusEdge;
        const dx = l.t.x - l.s.x,
          dy = l.t.y - l.s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        // 边线
        ctx.beginPath();
        ctx.moveTo(l.s.x, l.s.y);
        ctx.lineTo(l.t.x, l.t.y);
        if (isFocusEdge) {
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 3.5 / k;
          ctx.globalAlpha = 0.95;
        } else {
          ctx.strokeStyle = isHl ? "#38bdf8" : "#1e3a5f";
          ctx.lineWidth = (isHl ? 2.5 : 1) / k;
          ctx.globalAlpha = isHl ? 0.8 : 0.3;
        }
        ctx.stroke();
        ctx.globalAlpha = 1;

        // 强调边的发光效果
        if (isFocusEdge) {
          ctx.save();
          ctx.strokeStyle = "#fbbf2480";
          ctx.lineWidth = 8 / k;
          ctx.globalAlpha = 0.3 + 0.15 * Math.sin(t * 4);
          ctx.beginPath();
          ctx.moveTo(l.s.x, l.s.y);
          ctx.lineTo(l.t.x, l.t.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.restore();
        }

        // 流光粒子
        for (let pi = 0; pi < l.particles.length; pi++) {
          l.particles[pi] = (l.particles[pi] + dt * (isAnyHl ? 0.35 : 0.18)) % 1;
          const t = l.particles[pi];
          const px = l.s.x + dx * t,
            py = l.s.y + dy * t;
          const pr = (isAnyHl ? 3.5 : 2) / k;
          const pGrad = ctx.createRadialGradient(px, py, 0, px, py, pr * 2.5);
          pGrad.addColorStop(
            0,
            isFocusEdge ? "rgba(251,191,36,0.9)" : isHl ? "rgba(56,189,248,0.9)" : "rgba(14,165,233,0.7)",
          );
          pGrad.addColorStop(1, isFocusEdge ? "rgba(251,191,36,0)" : "rgba(14,165,233,0)");
          ctx.fillStyle = pGrad;
          ctx.beginPath();
          ctx.arc(px, py, pr * 2.5, 0, Math.PI * 2);
          ctx.fill();
          // 实心核
          ctx.fillStyle = isFocusEdge ? "#fde68a" : isHl ? "#7dd3fc" : "#38bdf8";
          ctx.beginPath();
          ctx.arc(px, py, pr * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }

        // 箭头
        const arrowLen = (isAnyHl ? 10 : 7) / k;
        const arrowW = (isAnyHl ? 5 : 3.5) / k;
        const ax = l.t.x - (dx / dist) * (l.t.r + 4 / k);
        const ay = l.t.y - (dy / dist) * (l.t.r + 4 / k);
        const angle = Math.atan2(dy, dx);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-arrowLen, -arrowW);
        ctx.lineTo(-arrowLen, arrowW);
        ctx.closePath();
        ctx.fillStyle = isFocusEdge ? "#fbbf24" : isHl ? "#38bdf8" : "#1e3a5f";
        ctx.globalAlpha = isAnyHl ? 0.85 : 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();

        // 关系标签（选中或强调时）
        if (isAnyHl) {
          const mx = (l.s.x + l.t.x) / 2,
            my = (l.s.y + l.t.y) / 2;
          const fs = 10 / k;
          ctx.font = `600 ${fs}px "Microsoft YaHei", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const tw = ctx.measureText(l.rel).width;
          // 背景pill
          const pad = 4 / k;
          ctx.fillStyle = "rgba(15,23,42,0.85)";
          ctx.beginPath();
          const rx = mx - tw / 2 - pad,
            ry = my - fs / 2 - pad / 2;
          const rw = tw + pad * 2,
            rh = fs + pad;
          const cr = 4 / k;
          ctx.moveTo(rx + cr, ry);
          ctx.lineTo(rx + rw - cr, ry);
          ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + cr);
          ctx.lineTo(rx + rw, ry + rh - cr);
          ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - cr, ry + rh);
          ctx.lineTo(rx + cr, ry + rh);
          ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - cr);
          ctx.lineTo(rx, ry + cr);
          ctx.quadraticCurveTo(rx, ry, rx + cr, ry);
          ctx.fill();
          ctx.strokeStyle = "#334155";
          ctx.lineWidth = 0.5 / k;
          ctx.stroke();
          ctx.fillStyle = isFocusEdge ? "#f59e0b" : "#fbbf24";
          ctx.fillText(l.rel, mx, my);
        }
      }

      // ── 绘制节点 ──
      for (const n of s.nodes) {
        const p = palette(n.type);
        const isSel = n === selNode;
        const isHov = n === hoverNode;
        const isNeighbor = neighborIds.has(n.id);
        const isSearchHit = searchHitsRef.current.has(n.bid);
        const isBatch = batchSetRef.current.has(n.bid);
        const isFocusNode = hlNodeIds.has(n.id);

        const dimmed = selNode && !isNeighbor && !isSel;

        // 外层辉光
        if (isSel || isSearchHit || isHov || isBatch || isFocusNode) {
          const glowR =
            n.r +
            (isFocusNode
              ? 18 + Math.sin(t * 3.5) * 7
              : isSel
                ? 16 + Math.sin(t * 3) * 6
                : isSearchHit
                  ? 12 + Math.sin(t * 4) * 4
                  : isBatch
                    ? 10
                    : 8);
          const gr = ctx.createRadialGradient(
            n.x,
            n.y,
            n.r * 0.5,
            n.x,
            n.y,
            glowR / k > 2 ? glowR : glowR,
          );
          gr.addColorStop(
            0,
            isFocusNode
              ? "#fbbf2470"
              : isSel
                ? p.glow
                : isSearchHit
                  ? "#38bdf860"
                  : isBatch
                    ? "#22c55e50"
                    : p.glow.replace("80", "40"),
          );
          gr.addColorStop(1, "transparent");
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
          ctx.fill();
        }

        // 强调节点旋转环（金色）
        if (isFocusNode && !isSel) {
          ctx.save();
          ctx.translate(n.x, n.y);
          ctx.rotate(-t * 0.6);
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 2 / k;
          ctx.globalAlpha = 0.7;
          ctx.setLineDash([8 / k, 5 / k]);
          ctx.beginPath();
          ctx.arc(0, 0, n.r + 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          ctx.restore();
        }

        // 选中旋转环
        if (isSel) {
          ctx.save();
          ctx.translate(n.x, n.y);
          ctx.rotate(t * 0.8);
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 1.5 / k;
          ctx.globalAlpha = 0.6;
          ctx.setLineDash([6 / k, 4 / k]);
          ctx.beginPath();
          ctx.arc(0, 0, n.r + 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          ctx.restore();
        }

        // 主圆 — 径向渐变
        const ng = ctx.createRadialGradient(
          n.x - n.r * 0.3,
          n.y - n.r * 0.3,
          0,
          n.x,
          n.y,
          n.r,
        );
        ng.addColorStop(0, lighten(p.fill, 40));
        ng.addColorStop(0.7, p.fill);
        ng.addColorStop(1, darken(p.fill, 30));
        ctx.fillStyle = ng;
        ctx.globalAlpha = dimmed ? 0.25 : 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();

        // 描边
        ctx.strokeStyle = isFocusNode
          ? "#fbbf24"
          : isSel
            ? "#ffffff"
            : n.fixed
              ? "#ef4444"
              : isSearchHit
                ? "#38bdf8"
                : isBatch
                  ? "#22c55e"
                  : isHov
                    ? "#e2e8f0"
                    : p.fill;
        ctx.lineWidth = (isSel || n.fixed ? 2.5 : isHov ? 2 : 1) / k;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // 高光点
        if (!dimmed) {
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.beginPath();
          ctx.arc(
            n.x - n.r * 0.28,
            n.y - n.r * 0.28,
            n.r * 0.25,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }

        // 批选勾
        if (isBatch) {
          const cr = 5 / k;
          ctx.fillStyle = "#22c55e";
          ctx.beginPath();
          ctx.arc(n.x + n.r * 0.7, n.y - n.r * 0.7, cr, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.2 / k;
          ctx.beginPath();
          ctx.moveTo(n.x + n.r * 0.7 - cr * 0.35, n.y - n.r * 0.7);
          ctx.lineTo(n.x + n.r * 0.7, n.y - n.r * 0.7 + cr * 0.35);
          ctx.lineTo(n.x + n.r * 0.7 + cr * 0.45, n.y - n.r * 0.7 - cr * 0.35);
          ctx.stroke();
        }

        // 名称标签
        if (!dimmed && (k > 0.35 || isSel || isHov || isSearchHit)) {
          const fs = (isSel ? 13 : isHov ? 12 : 11) / k;
          ctx.font = `${isSel ? "700" : "500"} ${fs}px "Microsoft YaHei", "PingFang SC", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          // 文字描边
          ctx.strokeStyle = "rgba(2,6,23,0.75)";
          ctx.lineWidth = 3 / k;
          ctx.lineJoin = "round";
          ctx.strokeText(n.id, n.x, n.y + n.r + 4 / k);
          ctx.fillStyle = isFocusNode ? "#fde68a" : isSel ? "#ffffff" : isSearchHit ? "#67e8f9" : p.text;
          ctx.fillText(n.id, n.x, n.y + n.r + 4 / k);
        }
      }

      ctx.restore();
      ctx.restore();

      raf.current = requestAnimationFrame(render);
    };

    raf.current = requestAnimationFrame(render);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 保持 ref 同步（避免闭包旧值） ── */
  const searchHitsRef = useRef(searchHits);
  searchHitsRef.current = searchHits;
  const batchSetRef = useRef(batchSet);
  batchSetRef.current = batchSet;
  const batchModeRef = useRef(batchMode);
  batchModeRef.current = batchMode;

  /* ═══════════ 交互事件 ═══════════ */

  const world = useCallback((e: React.MouseEvent) => {
    const rect = cvs.current.getBoundingClientRect();
    const sx = e.clientX - rect.left,
      sy = e.clientY - rect.top;
    const s = sim.current;
    return { x: (sx - s.cam.x) / s.cam.k, y: (sy - s.cam.y) / s.cam.k };
  }, []);

  const hitTest = useCallback((wx: number, wy: number) => {
    const s = sim.current;
    for (let i = s.nodes.length - 1; i >= 0; i--) {
      const n = s.nodes[i];
      const dx = n.x - wx,
        dy = n.y - wy;
      if (dx * dx + dy * dy < (n.r + 4 / s.cam.k) ** 2) return n;
    }
    return null;
  }, []);

  const onDown = useCallback(
    (e: React.MouseEvent) => {
      const p = world(e);
      const hit = hitTest(p.x, p.y);
      const s = sim.current;
      if (hit) {
        if (batchModeRef.current) {
          setBatchSet((prev) => {
            const next = new Set(prev);
            if (next.has(hit.bid)) next.delete(hit.bid);
            else next.add(hit.bid);
            return next;
          });
          return;
        }
        s.dragging = hit;
        hit.fixed = true;
        s.selected = hit;
        setSelectedId(hit.bid);
        setEditName(hit.id);
        setEditType(hit.type);
        setEditWeight(hit.w);
        setEditMode(false);
        s.alpha = Math.max(s.alpha, 0.08); // 微微 reheat
      } else {
        s.dragging = "cam";
        s.dragStart = {
          mx: e.clientX,
          my: e.clientY,
          cx: s.cam.x,
          cy: s.cam.y,
        };
        if (!batchModeRef.current) {
          s.selected = null;
          setSelectedId(null);
          setEditMode(false);
        }
      }
    },
    [world, hitTest],
  );

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      const p = world(e);
      const s = sim.current;
      s.mouseWorld = p;
      const hit = hitTest(p.x, p.y);
      s.hover = hit;
      cvs.current.style.cursor = hit
        ? "pointer"
        : s.dragging === "cam"
          ? "grabbing"
          : "default";

      if (s.dragging && s.dragging !== "cam") {
        s.dragging.x = p.x;
        s.dragging.y = p.y;
        s.dragging.vx = 0;
        s.dragging.vy = 0;
      } else if (s.dragging === "cam") {
        const dx = e.clientX - s.dragStart.mx,
          dy = e.clientY - s.dragStart.my;
        s.cam.x = s.cam.tx = s.dragStart.cx + dx;
        s.cam.y = s.cam.ty = s.dragStart.cy + dy;
      }
    },
    [world, hitTest],
  );

  const onUp = useCallback(() => {
    sim.current.dragging = null;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const s = sim.current;
    const delta = -e.deltaY * 0.001;
    const nk = Math.min(Math.max(0.08, s.cam.k + delta), 6);
    const rect = cvs.current.getBoundingClientRect();
    const sx = e.clientX - rect.left,
      sy = e.clientY - rect.top;
    const wx = (sx - s.cam.x) / s.cam.k,
      wy = (sy - s.cam.y) / s.cam.k;
    s.cam.tk = nk;
    s.cam.tx = sx - wx * nk;
    s.cam.ty = sy - wy * nk;
  }, []);

  /* ═══════════ 操作回调 ═══════════ */

  const handleSearch = useCallback(async () => {
    if (!searchQ.trim()) {
      setSearchHits(new Set());
      return;
    }
    try {
      const res = await apiSearchGraphNodes(searchQ.trim(), 50);
      setSearchHits(new Set(res.map((r) => r.id)));
      if (!res.length) toast.info("未找到匹配节点");
      else toast.success(`找到 ${res.length} 个匹配节点`);
    } catch {
      const q = searchQ.trim().toLowerCase();
      const hits = sim.current.nodes.filter((n) =>
        n.id.toLowerCase().includes(q),
      );
      setSearchHits(new Set(hits.map((n) => n.bid)));
    }
  }, [searchQ, toast]);

  const handleUpdate = useCallback(async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await apiUpdateGraphNode(selectedId, {
        name: editName,
        entity_type: editType,
        weight: editWeight,
      });
      toast.success("节点已更新");
      setEditMode(false);
      await loadData();
    } catch (e: any) {
      toast.error(`更新失败: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [selectedId, editName, editType, editWeight, toast, loadData]);

  const handleDelete = useCallback(async () => {
    if (!selectedId) return;
    if (
      !(await confirm({
        message: "确定删除该节点及其所有关联边？",
        variant: "danger",
        confirmText: "删除",
      }))
    )
      return;
    setSaving(true);
    try {
      await apiDeleteGraphNode(selectedId);
      toast.success("节点已删除");
      setSelectedId(null);
      sim.current.selected = null;
      await loadData();
    } catch (e: any) {
      toast.error(`删除失败: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [selectedId, toast, loadData]);

  const handleBatchDel = useCallback(async () => {
    if (!batchSet.size) {
      toast.info("请先选择节点");
      return;
    }
    if (
      !(await confirm({
        message: `确定删除选中的 ${batchSet.size} 个节点？`,
        variant: "danger",
        confirmText: "批量删除",
      }))
    )
      return;
    setSaving(true);
    try {
      const r = await apiDeleteGraphNodes(Array.from(batchSet));
      toast.success(`删除 ${r.deleted} 个节点`);
      setBatchSet(new Set());
      setBatchMode(false);
      await loadData();
    } catch (e: any) {
      toast.error(`批量删除失败: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [batchSet, toast, loadData]);

  const zoomTo = useCallback((factor: number) => {
    const s = sim.current;
    s.cam.tk = Math.min(Math.max(0.08, s.cam.tk * factor), 6);
  }, []);

  const fitView = useCallback(() => {
    const s = sim.current;
    if (!s.nodes.length) return;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of s.nodes) {
      minX = Math.min(minX, n.x - n.r);
      maxX = Math.max(maxX, n.x + n.r);
      minY = Math.min(minY, n.y - n.r);
      maxY = Math.max(maxY, n.y + n.r);
    }
    const pw = maxX - minX + 80,
      ph = maxY - minY + 80;
    const nk = Math.min(s.width / pw, s.height / ph, 3);
    const mcx = (minX + maxX) / 2,
      mcy = (minY + maxY) / 2;
    s.cam.tk = nk;
    s.cam.tx = s.width / 2 - mcx * nk;
    s.cam.ty = s.height / 2 - mcy * nk;
  }, []);

  /* ── 统计 ── */
  const entityTypes = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of rawNodes)
      m.set(n.entity_type, (m.get(n.entity_type) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rawNodes]);

  const selNode = useMemo(
    () => sim.current.nodes.find((n) => n.bid === selectedId),
    [selectedId, rawNodes],
  );
  const selRaw = useMemo(
    () => rawNodes.find((n) => n.id === selectedId),
    [rawNodes, selectedId],
  );

  const selLinks = useMemo(() => {
    if (!selectedId) return [];
    return sim.current.links.filter(
      (l) => l.s.bid === selectedId || l.t.bid === selectedId,
    );
  }, [selectedId, rawNodes]);

  /* ═══════════ JSX ═══════════ */

  return (
    <div
      ref={boxRef}
      className="h-full w-full bg-[#020617] relative overflow-hidden select-none"
    >
      <canvas
        ref={cvs}
        className="block outline-none"
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onWheel={onWheel}
      />

      {/* ── 顶栏 ── */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        <div className="flex items-center justify-between p-3 gap-3">
          {/* 左：状态 */}
          <div className="flex gap-2 pointer-events-auto">
            <Chip className="text-cyan-400 shadow-cyan-500/10">
              <Activity size={11} className="mr-1.5 animate-pulse" />
              SIM LIVE
            </Chip>
            <Chip className="text-purple-400 shadow-purple-500/10">
              {rawNodes.length} 节点 · {sim.current.links.length} 边
            </Chip>
          </div>

          {/* 中：搜索 */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                  if (e.key === "Escape") {
                    setSearchQ("");
                    setSearchHits(new Set());
                  }
                }}
                placeholder="搜索节点..."
                className="bg-slate-900/80 backdrop-blur border border-slate-700/60 text-white text-xs pl-8 pr-7 py-1.5 rounded-lg w-52 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 placeholder-slate-500 transition-all"
              />
              {searchQ && (
                <button
                  onClick={() => {
                    setSearchQ("");
                    setSearchHits(new Set());
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <BtnSm
              onClick={handleSearch}
              className="bg-cyan-600/80 hover:bg-cyan-500 text-white shadow-cyan-500/20"
            >
              搜索
            </BtnSm>
          </div>

          {/* 右：操作 */}
          <div className="flex gap-1.5 pointer-events-auto">
            <BtnSm
              onClick={() => setShowLabels(!showLabels)}
              className={
                showLabels ? "bg-amber-600/80 text-white" : "btn-ghost"
              }
            >
              <Eye size={11} className="mr-1" />
              标签
            </BtnSm>
            {canEdit && (
              <BtnSm
                onClick={() => {
                  setBatchMode(!batchMode);
                  if (batchMode) setBatchSet(new Set());
                }}
                className={batchMode ? "bg-amber-600 text-white" : "btn-ghost"}
              >
                <CheckSquare size={11} className="mr-1" />
                {batchMode ? `已选${batchSet.size}` : "多选"}
              </BtnSm>
            )}
            {canEdit && batchMode && batchSet.size > 0 && (
              <BtnSm
                onClick={handleBatchDel}
                disabled={saving}
                className="bg-red-600/80 hover:bg-red-500 text-white shadow-red-500/20"
              >
                <Trash2 size={11} className="mr-1" />
                删除({batchSet.size})
              </BtnSm>
            )}
            <BtnSm onClick={loadData} className="btn-ghost">
              <RotateCcw size={11} className="mr-1" />
              刷新
            </BtnSm>
          </div>
        </div>
      </div>

      {/* ── 右下：缩放 ── */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 pointer-events-auto z-10">
        <BtnIcon onClick={() => zoomTo(1.3)}>
          <ZoomIn size={14} />
        </BtnIcon>
        <BtnIcon onClick={() => zoomTo(0.75)}>
          <ZoomOut size={14} />
        </BtnIcon>
        <BtnIcon onClick={fitView}>
          <Maximize2 size={14} />
        </BtnIcon>
      </div>

      {/* ── 右侧详情面板 ── */}
      <div
        className={`absolute top-16 right-3 w-[310px] bg-slate-900/92 backdrop-blur-xl border border-slate-700/50 text-slate-200 rounded-2xl shadow-2xl shadow-black/40 transition-all duration-400 z-10 ${selectedId && selNode && !batchMode ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-0 pointer-events-none"}`}
      >
        {selNode && (
          <>
            {/* 头 */}
            <div className="px-5 pt-4 pb-3 border-b border-slate-700/40 flex justify-between items-start">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0 shadow-lg"
                  style={{
                    background: palette(selNode.type).fill,
                    boxShadow: `0 0 10px ${palette(selNode.type).glow}`,
                  }}
                />
                {editMode ? (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    className="bg-slate-800 border border-slate-600 text-white px-2 py-0.5 rounded text-sm w-40 focus:outline-none focus:border-cyan-500"
                  />
                ) : (
                  <h3 className="text-base font-bold text-white truncate">
                    {selNode.id}
                  </h3>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedId(null);
                  sim.current.selected = null;
                  setEditMode(false);
                }}
                className="text-slate-500 hover:text-white transition p-0.5"
              >
                <X size={15} />
              </button>
            </div>

            {/* 信息 */}
            <div className="px-5 py-4 space-y-2.5 text-sm">
              <Row label="类型">
                {editMode ? (
                  <input
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="bg-slate-800 border border-slate-600 text-white px-2 py-0.5 rounded text-xs w-24 focus:outline-none focus:border-cyan-500"
                  />
                ) : (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: `${palette(selNode.type).fill}20`,
                      color: palette(selNode.type).fill,
                      border: `1px solid ${palette(selNode.type).fill}30`,
                    }}
                  >
                    {selNode.type}
                  </span>
                )}
              </Row>
              <Row label="权重">
                {editMode ? (
                  <input
                    type="number"
                    value={editWeight}
                    onChange={(e) => setEditWeight(+e.target.value || 1)}
                    min={1}
                    className="bg-slate-800 border border-slate-600 text-white px-2 py-0.5 rounded text-xs w-16 focus:outline-none focus:border-cyan-500"
                  />
                ) : (
                  <span className="text-white font-mono text-xs">
                    {selNode.w}
                  </span>
                )}
              </Row>
              {selRaw?.created_at && (
                <Row label="创建">
                  <span className="text-slate-400 text-xs">
                    {new Date(selRaw.created_at).toLocaleString("zh-CN")}
                  </span>
                </Row>
              )}

              {/* 关系 */}
              <div className="pt-2 border-t border-slate-700/40">
                <div className="text-xs text-slate-500 font-medium mb-1.5">
                  关联关系
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1 scrollbar-thin">
                  {selLinks.length ? (
                    selLinks.map((l, i) => (
                      <div
                        key={i}
                        className="text-[11px] flex items-center gap-1"
                      >
                        <span className="text-cyan-400 truncate max-w-[72px]">
                          {l.s.bid === selectedId ? l.s.id : l.t.id}
                        </span>
                        <span className="text-slate-600">→</span>
                        <span className="text-amber-400 flex-shrink-0">
                          [{l.rel}]
                        </span>
                        <span className="text-slate-600">→</span>
                        <span className="text-emerald-400 truncate max-w-[72px]">
                          {l.s.bid === selectedId ? l.t.id : l.s.id}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-600 italic">暂无</div>
                  )}
                </div>
              </div>
            </div>

            {/* 按钮 */}
            <div className="px-5 pb-4 flex gap-2">
              {editMode ? (
                <>
                  <BtnPanel
                    onClick={handleUpdate}
                    disabled={saving}
                    className="bg-cyan-600 hover:bg-cyan-500 shadow-cyan-500/20"
                  >
                    <Save size={12} className="mr-1" />
                    {saving ? "保存中…" : "保存"}
                  </BtnPanel>
                  <BtnPanel
                    onClick={() => {
                      setEditMode(false);
                      if (selNode) {
                        setEditName(selNode.id);
                        setEditType(selNode.type);
                        setEditWeight(selNode.w);
                      }
                    }}
                    className="bg-slate-700 hover:bg-slate-600"
                  >
                    取消
                  </BtnPanel>
                </>
              ) : canEdit ? (
                <>
                  <BtnPanel
                    onClick={() => setEditMode(true)}
                    className="bg-slate-700 hover:bg-slate-600"
                  >
                    <Pencil size={12} className="mr-1" />
                    编辑
                  </BtnPanel>
                  <BtnPanel
                    onClick={handleDelete}
                    disabled={saving}
                    className="bg-red-600/80 hover:bg-red-500 shadow-red-500/20"
                  >
                    <Trash2 size={12} className="mr-1" />
                    删除
                  </BtnPanel>
                </>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* ── 左下图例 ── */}
      <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur-xl border border-slate-700/40 rounded-2xl p-3.5 shadow-2xl z-10 max-w-[260px]">
        <div className="text-[10px] text-slate-500 font-semibold mb-2 flex items-center gap-1">
          <Layers size={10} />
          实体类型
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-1">
          {entityTypes.map(([t, c]) => (
            <div key={t} className="flex items-center gap-1.5 text-[11px]">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  background: palette(t).fill,
                  boxShadow: `0 0 6px ${palette(t).glow}`,
                }}
              />
              <span className="text-slate-300">{t}</span>
              <span className="text-slate-600 font-mono ml-auto">{c}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 搜索命中 ── */}
      {searchHits.size > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-cyan-950/80 backdrop-blur border border-cyan-800/50 rounded-xl px-4 py-2 shadow-2xl z-10">
          <div className="text-xs text-cyan-300 flex items-center gap-2">
            <Eye size={11} />
            命中 <b className="text-white">{searchHits.size}</b> 个节点
            <button
              onClick={() => {
                setSearchQ("");
                setSearchHits(new Set());
              }}
              className="text-cyan-400 hover:text-white ml-1"
            >
              <X size={11} />
            </button>
          </div>
        </div>
      )}

      {/* ── loading ── */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#020617]/80 z-30">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-cyan-400 text-sm font-medium animate-pulse">
              加载知识图谱…
            </span>
          </div>
        </div>
      )}
      {ConfirmDialog}
    </div>
  );
};

/* ═══════════ 小工具组件 ═══════════ */

function Chip({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-slate-900/80 backdrop-blur border border-slate-700/60 text-[11px] px-2.5 py-1 rounded-lg font-mono flex items-center shadow-lg ${className}`}
    >
      {children}
    </div>
  );
}

function BtnSm({
  children,
  className = "",
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return (
    <button
      {...p}
      className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all flex items-center shadow-lg disabled:opacity-40 ${className.includes("btn-ghost") ? "bg-slate-900/80 backdrop-blur border border-slate-700/60 text-slate-300 hover:text-white hover:border-slate-500" : className}`}
    >
      {children}
    </button>
  );
}

function BtnIcon({
  children,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900/80 backdrop-blur border border-slate-700/60 text-slate-400 hover:text-white hover:border-slate-500 shadow-lg transition-all"
    >
      {children}
    </button>
  );
}

function BtnPanel({
  children,
  className = "",
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={`flex-1 py-1.5 text-white rounded-lg font-medium text-xs transition-all flex items-center justify-center disabled:opacity-40 shadow-lg ${className}`}
    >
      {children}
    </button>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500 text-xs">{label}</span>
      {children}
    </div>
  );
}

/* ═══════════ 颜色工具 ═══════════ */

function lighten(hex: string, pct: number): string {
  const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  const f = pct / 100;
  return `rgb(${Math.min(255, r + (255 - r) * f)},${Math.min(255, g + (255 - g) * f)},${Math.min(255, b + (255 - b) * f)})`;
}

function darken(hex: string, pct: number): string {
  const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - pct / 100;
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}
