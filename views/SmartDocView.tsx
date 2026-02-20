import React, { useState, useEffect, useMemo } from "react";
import {
  FileText,
  Sparkles,
  ChevronRight,
  Save,
  BookOpen,
  FileCheck,
  CloudUpload,
  Upload,
  PenTool,
  ShieldAlert,
  Loader2,
  Search,
  Plus,
  Trash2,
  X,
  MoreVertical,
  Edit3,
  Archive,
  FileInput,
  FileOutput,
  CheckCircle,
  AlertTriangle,
  Layout,
} from "lucide-react";
import {
  apiListDocuments,
  apiGetDocument,
  apiCreateDocument,
  apiUpdateDocument,
  apiDeleteDocument,
  apiArchiveDocument,
  apiImportDocument,
  apiExportDocuments,
  apiProcessDocument,
  apiListMaterials,
  apiCreateMaterial,
  apiDeleteMaterial,
  apiListCollections,
  DOC_STATUS_MAP,
  DOC_TYPE_MAP,
  SECURITY_MAP,
  URGENCY_MAP,
  type DocListItem,
  type DocDetail,
  type Material,
  type KBCollection,
} from "../api";
import { EmptyState, Modal } from "../components/ui";

/* ── 常量 ── */
const DOC_TYPES = [
  { value: "", label: "公文类型：全部" },
  { value: "request", label: "请示" },
  { value: "report", label: "报告" },
  { value: "notice", label: "通知" },
  { value: "briefing", label: "汇报" },
];
const SECURITY_OPTS = [
  { value: "", label: "密级：全部" },
  { value: "public", label: "公开" },
  { value: "internal", label: "内部" },
  { value: "secret", label: "秘密" },
  { value: "confidential", label: "机密" },
];
const DOC_STATUS_OPTS = [
  { value: "", label: "全部" },
  { value: "draft", label: "草稿" },
  { value: "checked", label: "已检查" },
  { value: "optimized", label: "已优化" },
  { value: "archived", label: "已归档" },
];
const TPL_STATUS_OPTS = [
  { value: "", label: "全部" },
  { value: "unfilled", label: "未补充" },
  { value: "filled", label: "已补充" },
  { value: "archived", label: "已归档" },
];

const statusCls = (s: string) => {
  switch (s) {
    case "archived":
      return "bg-green-100 text-green-700";
    case "draft":
    case "unfilled":
      return "bg-yellow-100 text-yellow-700";
    case "filled":
      return "bg-purple-100 text-purple-700";
    default:
      return "bg-blue-100 text-blue-700";
  }
};

export const SmartDocView = ({
  toast,
  currentUser,
}: {
  toast: any;
  currentUser: any;
}) => {
  const [view, setView] = useState<"list" | "create">("list");
  const [activeTab, setActiveTab] = useState("doc");

  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [docsTotal, setDocsTotal] = useState(0);
  const [currentDoc, setCurrentDoc] = useState<DocDetail | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [processType, setProcessType] = useState("draft");
  const [isProcessing, setIsProcessing] = useState(false);

  // Filters (English values)
  const [filters, setFilters] = useState({
    keyword: "",
    startDate: "",
    endDate: "",
    type: "",
    security: "",
    status: "",
  });
  const [selectedDocIds, setSelectedDocIds] = useState(new Set<string>());
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCategory, setImportCategory] = useState("doc");
  const [importDocType, setImportDocType] = useState("report");
  const [importSecurity, setImportSecurity] = useState("internal");
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [optimizeTarget, setOptimizeTarget] = useState<DocListItem | null>(
    null,
  );
  const [kbCollections, setKbCollections] = useState<KBCollection[]>([]);
  const [selectedOptimizeKb, setSelectedOptimizeKb] = useState("");

  // Editor State
  const [step, setStep] = useState(1);
  const [rightPanel, setRightPanel] = useState<string | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [matSearch, setMatSearch] = useState("");
  const [matCategory, setMatCategory] = useState("全部");
  const [reviewResult, setReviewResult] = useState<any>(null);
  const [isAddingMat, setIsAddingMat] = useState(false);
  const [newMat, setNewMat] = useState({
    title: "",
    category: "通用",
    content: "",
  });

  /* ── 数据加载 ── */
  const loadDocs = async () => {
    try {
      const f: any = {};
      if (filters.keyword) f.keyword = filters.keyword;
      if (filters.type) f.doc_type = filters.type;
      if (filters.status) f.status = filters.status;
      if (filters.security) f.security = filters.security;
      if (filters.startDate) f.start_date = filters.startDate;
      if (filters.endDate) f.end_date = filters.endDate;
      const data = await apiListDocuments(
        activeTab,
        1,
        100,
        Object.keys(f).length > 0 ? f : undefined,
      );
      setDocs(data.items);
      setDocsTotal(data.total);
    } catch (err: any) {
      toast.error("加载文档失败: " + err.message);
    }
  };
  const loadMaterials = async () => {
    try {
      const data = await apiListMaterials();
      setMaterials(data);
    } catch (err: any) {
      toast.error("加载素材失败: " + err.message);
    }
  };
  const loadKbCollections = async () => {
    try {
      const data = await apiListCollections();
      setKbCollections(data);
    } catch {
      /* 非关键 */
    }
  };

  useEffect(() => {
    loadDocs();
  }, [activeTab, filters]);
  useEffect(() => {
    loadMaterials();
    loadKbCollections();
    setImportCategory(activeTab);
  }, []);
  useEffect(() => {
    setImportCategory(activeTab);
  }, [activeTab]);

  /* ── 文档操作 ── */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setUploadedFile(e.target.files[0]);
  };

  const handleProcess = async (
    customDoc: DocListItem | null = null,
    customType: string | null = null,
  ) => {
    const typeToUse = customType || processType;
    if (!customDoc && !uploadedFile)
      return toast.error("请先上传文档或选择现有文档");
    setIsProcessing(true);
    setActiveDropdownId(null);
    try {
      let docId = customDoc?.id;
      // 如果是新上传 — 先导入
      if (!docId && uploadedFile) {
        const imp = await apiImportDocument(
          uploadedFile,
          activeTab,
          "report",
          "internal",
        );
        docId = imp.id;
      }
      if (!docId) throw new Error("无法获取文档 ID");
      // 调用 AI 处理
      const result = await apiProcessDocument(docId, typeToUse);
      // 获取更新后的文档
      const updatedDoc = await apiGetDocument(docId);
      setCurrentDoc(updatedDoc);
      if (result.review_result) {
        setReviewResult(result.review_result);
        setRightPanel("review");
      } else {
        setRightPanel(null);
        setReviewResult(null);
      }
      setStep(3);
      if (view === "list") setView("create");
      loadDocs();
    } catch (err: any) {
      toast.error("处理失败: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const saveDoc = async () => {
    if (!currentDoc) return;
    try {
      await apiUpdateDocument(currentDoc.id, {
        content: currentDoc.content,
        title: currentDoc.title,
      });
      toast.success("公文已保存");
      loadDocs();
    } catch (err: any) {
      toast.error("保存失败: " + err.message);
    }
  };

  const handleArchive = async (d: DocListItem) => {
    if (!confirm(`确定归档《${d.title}》吗？`)) return;
    try {
      await apiArchiveDocument(d.id);
      loadDocs();
      toast.success("文档已归档");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("删除此记录？")) return;
    try {
      await apiDeleteDocument(id);
      loadDocs();
      toast.success("已删除");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openDoc = async (d: DocListItem) => {
    try {
      const detail = await apiGetDocument(d.id);
      setCurrentDoc(detail);
      setStep(3);
      setView("create");
    } catch (err: any) {
      toast.error("加载文档失败: " + err.message);
    }
  };

  /* ── 导入/导出 ── */
  const handleImport = async () => {
    if (!uploadedFile) return toast.error("请选择文件");
    try {
      await apiImportDocument(
        uploadedFile,
        importCategory,
        importDocType,
        importSecurity,
      );
      loadDocs();
      setShowImportModal(false);
      setUploadedFile(null);
      toast.success(`成功导入为${importCategory === "doc" ? "公文" : "模板"}`);
    } catch (err: any) {
      toast.error("导入失败: " + err.message);
    }
  };

  const handleExport = async () => {
    const targetIds =
      selectedDocIds.size > 0
        ? Array.from(selectedDocIds)
        : docs.map((d) => d.id);
    if (targetIds.length === 0) return toast.error("没有可导出的数据");
    try {
      const blob = await apiExportDocuments(targetIds, "csv");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeTab === "template" ? "模板" : "公文"}_导出_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`成功导出 ${targetIds.length} 条记录`);
    } catch (err: any) {
      toast.error("导出失败: " + err.message);
    }
  };

  /* ── 素材操作 ── */
  const insertText = (text: string) => {
    if (currentDoc) {
      setCurrentDoc({
        ...currentDoc,
        content: currentDoc.content + "\n" + text,
      });
      toast.success("已插入光标处");
    }
  };
  const handleSaveMaterial = async () => {
    if (!newMat.title || !newMat.content) return toast.error("标题和内容必填");
    try {
      await apiCreateMaterial(newMat);
      await loadMaterials();
      setIsAddingMat(false);
      setNewMat({ title: "", category: "通用", content: "" });
      toast.success("素材已添加");
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  const handleDeleteMaterial = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("删除此素材？")) return;
    try {
      await apiDeleteMaterial(id);
      await loadMaterials();
      toast.success("已删除");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  /* ── 选择 ── */
  const toggleSelectAll = () => {
    if (selectedDocIds.size === docs.length) setSelectedDocIds(new Set());
    else setSelectedDocIds(new Set(docs.map((d) => d.id)));
  };
  const toggleSelectOne = (id: string) => {
    const s = new Set(selectedDocIds);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelectedDocIds(s);
  };

  const startCreate = () => {
    setUploadedFile(null);
    setProcessType("draft");
    setReviewResult(null);
    setStep(1);
    setView("create");
  };

  /* ── 列表视图 ── */
  if (view === "list")
    return (
      <div
        className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
        onClick={() => setActiveDropdownId(null)}
      >
        <div className="p-4 border-b bg-gray-50 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Archive size={20} className="text-blue-600" /> 我的公文箱
              </h2>
              <div className="flex space-x-6 text-sm font-medium pt-1">
                <button
                  onClick={() => {
                    setActiveTab("doc");
                    setSelectedDocIds(new Set());
                    setFilters({ ...filters, status: "" });
                  }}
                  className={`pb-1 border-b-2 transition-colors ${activeTab === "doc" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                >
                  公文 (A类)
                </button>
                <button
                  onClick={() => {
                    setActiveTab("template");
                    setSelectedDocIds(new Set());
                    setFilters({ ...filters, status: "" });
                  }}
                  className={`pb-1 border-b-2 transition-colors ${activeTab === "template" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
                >
                  模板 (B类)
                </button>
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setShowImportModal(true)}
                className="px-3 py-1.5 border border-gray-300 bg-white text-gray-700 rounded text-sm flex items-center hover:bg-gray-50"
              >
                <FileInput size={16} className="mr-2" /> 导入
              </button>
              <button
                onClick={handleExport}
                className="px-3 py-1.5 border border-gray-300 bg-white text-gray-700 rounded text-sm flex items-center hover:bg-gray-50"
              >
                <FileOutput size={16} className="mr-2" /> 导出
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="relative col-span-1 lg:col-span-1">
              <Search
                size={14}
                className="absolute left-2.5 top-2.5 text-gray-400"
              />
              <input
                className="w-full pl-8 pr-2 py-1.5 border rounded text-xs outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="标题关键词..."
                value={filters.keyword}
                onChange={(e) =>
                  setFilters({ ...filters, keyword: e.target.value })
                }
              />
            </div>
            <div className="flex items-center gap-1 col-span-1 lg:col-span-2">
              <input
                type="date"
                className="w-full p-1.5 border rounded text-xs outline-none"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters({ ...filters, startDate: e.target.value })
                }
              />
              <span className="text-gray-400">-</span>
              <input
                type="date"
                className="w-full p-1.5 border rounded text-xs outline-none"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters({ ...filters, endDate: e.target.value })
                }
              />
            </div>
            <select
              className="p-1.5 border rounded text-xs outline-none bg-white"
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            >
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              className="p-1.5 border rounded text-xs outline-none bg-white"
              value={filters.security}
              onChange={(e) =>
                setFilters({ ...filters, security: e.target.value })
              }
            >
              {SECURITY_OPTS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              className="p-1.5 border rounded text-xs outline-none bg-white"
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              {(activeTab === "doc" ? DOC_STATUS_OPTS : TPL_STATUS_OPTS).map(
                (t) => (
                  <option key={t.value} value={t.value}>
                    {t.value ? t.label : "状态：全部"}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-white text-gray-500 border-b sticky top-0 z-10">
              <tr>
                <th className="p-4 w-10">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={
                      docs.length > 0 && selectedDocIds.size === docs.length
                    }
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider">
                  标题
                </th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider">
                  类型
                </th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider">
                  密级
                </th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider">
                  状态
                </th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider">
                  更新时间
                </th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wider w-24">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {docs.map((d) => (
                <tr
                  key={d.id}
                  className={`hover:bg-blue-50/30 group transition-colors ${selectedDocIds.has(d.id) ? "bg-blue-50/50" : ""}`}
                >
                  <td className="p-4">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedDocIds.has(d.id)}
                      onChange={() => toggleSelectOne(d.id)}
                    />
                  </td>
                  <td className="p-4 font-medium text-gray-800">
                    <div className="flex items-center">
                      {activeTab === "template" ? (
                        <Layout size={16} className="mr-2 text-purple-400" />
                      ) : (
                        <FileText
                          size={16}
                          className="mr-2 text-gray-400 group-hover:text-blue-500 transition-colors"
                        />
                      )}
                      <span
                        className="cursor-pointer hover:text-blue-600 transition-colors"
                        onClick={() => openDoc(d)}
                      >
                        {d.title}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[11px]">
                      {DOC_TYPE_MAP[d.doc_type] || d.doc_type}
                    </span>
                  </td>
                  <td className="p-4 text-gray-500 text-xs">
                    {SECURITY_MAP[d.security] || d.security}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${statusCls(d.status)}`}
                    >
                      {DOC_STATUS_MAP[d.status] || d.status}
                    </span>
                  </td>
                  <td className="p-4 text-gray-400 text-xs">
                    {new Date(d.updated_at).toLocaleString()}
                  </td>
                  <td className="p-4 relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdownId(
                          activeDropdownId === d.id ? null : d.id,
                        );
                      }}
                      className="p-1.5 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {activeDropdownId === d.id && (
                      <div className="absolute right-4 top-10 w-32 bg-white border rounded-md shadow-xl z-20 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                        <button
                          onClick={() => openDoc(d)}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                        >
                          <Edit3 size={14} className="mr-2" /> 编辑
                        </button>
                        {activeTab === "doc" && (
                          <>
                            <button
                              onClick={() => {
                                setOptimizeTarget(d);
                                setShowOptimizeModal(true);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-gray-100 flex items-center"
                            >
                              <Sparkles size={14} className="mr-2" /> 优化
                            </button>
                            <button
                              onClick={() => handleProcess(d, "check")}
                              className="w-full text-left px-4 py-2 text-sm text-orange-600 hover:bg-gray-100 flex items-center"
                            >
                              <ShieldAlert size={14} className="mr-2" /> 检查
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleArchive(d)}
                          className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-gray-100 flex items-center"
                        >
                          <Archive size={14} className="mr-2" /> 归档
                        </button>
                        <div className="h-px bg-gray-100 my-1"></div>
                        <button
                          onClick={() => handleDelete(d.id)}
                          className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-gray-100 flex items-center"
                        >
                          <Trash2 size={14} className="mr-2" /> 删除
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {docs.length === 0 && (
            <EmptyState
              icon={activeTab === "doc" ? FileText : Layout}
              title={activeTab === "doc" ? "暂无公文" : "暂无模板"}
              desc={activeTab === "doc" ? "请导入公文或新建" : "请导入模板文件"}
              action={null}
            />
          )}
        </div>

        {/* Import Modal */}
        {showImportModal && (
          <Modal
            title="导入文件"
            onClose={() => {
              setShowImportModal(false);
              setUploadedFile(null);
            }}
            footer={
              <button
                onClick={handleImport}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                确认导入
              </button>
            }
          >
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  id="import-up"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <label htmlFor="import-up" className="cursor-pointer">
                  {uploadedFile ? (
                    <div className="text-blue-600 font-bold">
                      {uploadedFile.name}
                    </div>
                  ) : (
                    <div className="text-gray-400 flex flex-col items-center">
                      <Upload size={24} className="mb-2" />
                      点击选择 Word 文件
                    </div>
                  )}
                </label>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">
                  导入为
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="import-cat"
                      checked={importCategory === "doc"}
                      onChange={() => setImportCategory("doc")}
                      className="mr-2"
                    />{" "}
                    公文 (A类)
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="import-cat"
                      checked={importCategory === "template"}
                      onChange={() => setImportCategory("template")}
                      className="mr-2"
                    />{" "}
                    模板 (B类)
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">
                    公文类型
                  </label>
                  <select
                    className="w-full border p-2 rounded text-sm"
                    value={importDocType}
                    onChange={(e) => setImportDocType(e.target.value)}
                  >
                    {DOC_TYPES.slice(1).map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">
                    密级
                  </label>
                  <select
                    className="w-full border p-2 rounded text-sm"
                    value={importSecurity}
                    onChange={(e) => setImportSecurity(e.target.value)}
                  >
                    {SECURITY_OPTS.slice(1).map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </Modal>
        )}

        {/* Optimize Modal */}
        {showOptimizeModal && (
          <Modal
            title="智能优化配置"
            onClose={() => setShowOptimizeModal(false)}
            size="sm"
            footer={
              <button
                onClick={() => {
                  setShowOptimizeModal(false);
                  if (optimizeTarget) handleProcess(optimizeTarget, "optimize");
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
              >
                确认优化
              </button>
            }
          >
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded text-xs text-blue-700">
                即将针对<b>《{optimizeTarget?.title}》</b>
                进行内容优化，请选择引用的知识库范围。
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">
                  引用知识库
                </label>
                <select
                  className="w-full border p-2 rounded text-sm bg-white outline-none focus:ring-1 focus:ring-blue-400"
                  value={selectedOptimizeKb}
                  onChange={(e) => setSelectedOptimizeKb(e.target.value)}
                >
                  <option value="">全部知识库</option>
                  {kbCollections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-gray-400 italic">
                * 选择"全部知识库"将联合检索系统全量合规条文。
              </p>
            </div>
          </Modal>
        )}
      </div>
    );

  /* ── 编辑器视图 ── */
  return (
    <div className="h-full flex flex-col bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="h-16 border-b flex items-center justify-between px-4 bg-gray-50 shrink-0">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setView("list");
              loadDocs();
            }}
            className="p-2 hover:bg-gray-200 rounded text-gray-500"
          >
            <ChevronRight size={20} className="rotate-180" />
          </button>
          <div className="flex flex-col">
            <span className="font-bold text-gray-800 text-sm">
              {step === 1 ? "公文智能处理中心" : currentDoc?.title}
            </span>
            {step === 3 && (
              <span
                className={`text-[10px] px-1 rounded w-fit ${currentDoc?.category === "template" ? "bg-purple-100 text-purple-600" : "bg-yellow-100 text-gray-500"}`}
              >
                {currentDoc?.category === "template"
                  ? "模板填充模式"
                  : "AI 辅助编辑中"}
              </span>
            )}
          </div>
        </div>
        {step === 3 && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() =>
                setRightPanel(rightPanel === "material" ? null : "material")
              }
              className={`p-2 rounded ${rightPanel === "material" ? "bg-blue-100 text-blue-600" : "hover:bg-gray-200 text-gray-600"}`}
              title="素材库"
            >
              <BookOpen size={18} />
            </button>
            <button
              onClick={() =>
                setRightPanel(rightPanel === "review" ? null : "review")
              }
              className={`p-2 rounded ${rightPanel === "review" ? "bg-blue-100 text-blue-600" : "hover:bg-gray-200 text-gray-600"}`}
              title="智能审查结果"
            >
              <FileCheck size={18} />
            </button>
            <div className="h-6 w-px bg-gray-300 mx-1"></div>
            <button
              onClick={saveDoc}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 shadow-sm flex items-center"
            >
              <Save size={16} className="mr-1" /> 保存
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto bg-slate-100 p-8 flex justify-center">
          {step === 1 && (
            <div className="w-full max-w-2xl bg-white p-10 rounded-2xl shadow-sm h-fit space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CloudUpload size={32} />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">
                  智能公文处理中心
                </h2>
                <p className="text-gray-500 mt-2 text-sm">
                  上传 Word 文档，AI 将协助您完成起草、检查与优化
                </p>
              </div>
              <div className="space-y-6">
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${uploadedFile ? "border-green-500 bg-green-50" : "border-gray-300 hover:border-blue-500 hover:bg-blue-50"}`}
                >
                  <input
                    type="file"
                    accept=".docx,.doc"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="doc-upload"
                  />
                  <label
                    htmlFor="doc-upload"
                    className="cursor-pointer block w-full h-full"
                  >
                    {uploadedFile ? (
                      <div className="flex flex-col items-center text-green-700">
                        <FileText size={48} className="mb-2" />
                        <span className="font-bold text-lg">
                          {uploadedFile.name}
                        </span>
                        <span className="text-xs mt-1">
                          {(uploadedFile.size / 1024).toFixed(1)} KB - 点击更换
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-gray-500">
                        <Upload size={32} className="mb-2" />
                        <span className="font-medium">
                          点击上传或拖拽 Word 文档至此
                        </span>
                        <span className="text-xs mt-1 text-gray-400">
                          支持 .docx, .doc 格式
                        </span>
                      </div>
                    )}
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    {
                      id: "draft",
                      label: "起草公文",
                      icon: PenTool,
                      desc: "基于大纲与知识库",
                    },
                    {
                      id: "check",
                      label: "检查公文",
                      icon: ShieldAlert,
                      desc: "错别字与敏感词检测",
                    },
                    {
                      id: "optimize",
                      label: "优化公文",
                      icon: Sparkles,
                      desc: "内容润色与提升",
                    },
                  ].map((action) => (
                    <div
                      key={action.id}
                      onClick={() => setProcessType(action.id)}
                      className={`p-4 border rounded-xl cursor-pointer transition-all flex flex-col items-center text-center ${processType === action.id ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"}`}
                    >
                      <action.icon size={24} className="mb-2" />
                      <div className="font-bold text-sm">{action.label}</div>
                      <div className="text-[10px] opacity-70 mt-1">
                        {action.desc}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => handleProcess()}
                  disabled={!uploadedFile || isProcessing}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="animate-spin mr-2" />{" "}
                      正在智能处理中...
                    </>
                  ) : (
                    "开始处理"
                  )}
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
                onChange={(e) =>
                  setCurrentDoc({ ...currentDoc, content: e.target.value })
                }
              />
            </div>
          )}
        </div>

        {step === 3 && rightPanel && (
          <div className="w-80 bg-white border-l shadow-xl z-10 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <span className="font-bold text-gray-700 flex items-center">
                {rightPanel === "material" && (
                  <>
                    <BookOpen size={16} className="mr-2" /> 素材库
                  </>
                )}
                {rightPanel === "review" && (
                  <>
                    <FileCheck size={16} className="mr-2" /> 智能审查结果
                  </>
                )}
              </span>
              <button onClick={() => setRightPanel(null)}>
                <X size={18} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {rightPanel === "material" &&
                (!isAddingMat ? (
                  <>
                    <div className="flex justify-between items-center mb-2">
                      <div className="relative flex-1 mr-2">
                        <input
                          className="w-full border rounded pl-8 pr-2 py-2 text-sm"
                          placeholder="搜索素材..."
                          value={matSearch}
                          onChange={(e) => setMatSearch(e.target.value)}
                        />
                        <Search
                          size={14}
                          className="absolute left-2.5 top-3 text-gray-400"
                        />
                      </div>
                      <button
                        onClick={() => setIsAddingMat(true)}
                        className="p-2 bg-blue-50 text-blue-600 rounded border border-blue-100 hover:bg-blue-100"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      {["全部", "开头", "结尾", "过渡", "政策"].map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setMatCategory(cat)}
                          className={`px-3 py-1 text-xs rounded-full whitespace-nowrap border ${matCategory === cat ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-3">
                      {materials
                        .filter(
                          (m) =>
                            (matCategory === "全部" ||
                              m.category === matCategory) &&
                            m.title.includes(matSearch),
                        )
                        .map((m) => (
                          <div
                            key={m.id}
                            className="p-3 border rounded hover:border-blue-400 hover:shadow-sm cursor-pointer group bg-slate-50 relative"
                            onClick={() => insertText(m.content)}
                          >
                            <div className="font-bold text-gray-700 text-xs mb-1 flex justify-between">
                              {m.title}
                              <div className="flex items-center space-x-1">
                                <span className="text-[10px] text-gray-400 bg-white px-1 border rounded">
                                  {m.category}
                                </span>
                                <Trash2
                                  size={12}
                                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                                  onClick={(e) => handleDeleteMaterial(e, m.id)}
                                />
                              </div>
                            </div>
                            <div className="text-xs text-gray-600 line-clamp-3 leading-relaxed">
                              {m.content}
                            </div>
                            <div className="mt-2 text-[10px] text-blue-600 opacity-0 group-hover:opacity-100 font-bold text-right">
                              点击插入 +
                            </div>
                          </div>
                        ))}
                    </div>
                  </>
                ) : (
                  <div className="bg-gray-50 p-4 rounded border">
                    <h4 className="font-bold text-gray-700 mb-3 text-sm">
                      新增素材
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          标题
                        </label>
                        <input
                          className="w-full border rounded p-2 text-sm"
                          value={newMat.title}
                          onChange={(e) =>
                            setNewMat({ ...newMat, title: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          分类
                        </label>
                        <select
                          className="w-full border rounded p-2 text-sm"
                          value={newMat.category}
                          onChange={(e) =>
                            setNewMat({ ...newMat, category: e.target.value })
                          }
                        >
                          {["开头", "结尾", "过渡", "政策", "通用"].map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          内容
                        </label>
                        <textarea
                          className="w-full border rounded p-2 text-sm h-24"
                          value={newMat.content}
                          onChange={(e) =>
                            setNewMat({ ...newMat, content: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={handleSaveMaterial}
                          className="flex-1 bg-blue-600 text-white py-1.5 rounded text-sm"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setIsAddingMat(false)}
                          className="flex-1 bg-white border text-gray-600 py-1.5 rounded text-sm"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

              {rightPanel === "review" &&
                (!reviewResult ? (
                  <div className="text-center py-10 text-gray-400 flex flex-col items-center">
                    <CheckCircle size={32} className="mb-2 text-gray-300" />
                    <p>暂无审查结果</p>
                    <p className="text-xs mt-1">请尝试使用"检查公文"功能</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-orange-50 border border-orange-200 rounded p-3 text-xs text-orange-800 mb-4 flex items-center">
                      <AlertTriangle size={14} className="mr-2" /> 检测到{" "}
                      {(reviewResult.typos?.length || 0) +
                        (reviewResult.sensitive?.length || 0) +
                        (reviewResult.grammar?.length || 0)}{" "}
                      个潜在问题
                    </div>
                    {reviewResult.typos?.length > 0 && (
                      <div className="text-xs font-bold text-gray-500 uppercase mb-2">
                        错别字 / 拼写
                      </div>
                    )}
                    {reviewResult.typos?.map((item, i) => (
                      <div
                        key={i}
                        className="p-3 border rounded mb-2 bg-red-50 border-red-100"
                      >
                        <div className="text-xs text-gray-500 mb-1">
                          原文：{item.context}
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-red-600 line-through mr-2">
                            {item.text}
                          </span>
                          <span className="text-sm font-bold text-green-600">
                            {item.suggestion}
                          </span>
                          <button
                            className="text-xs bg-white border px-2 py-1 rounded text-gray-600 hover:text-blue-600"
                            onClick={() => toast.success("已修正")}
                          >
                            采纳
                          </button>
                        </div>
                      </div>
                    ))}
                    {reviewResult.sensitive?.length > 0 && (
                      <div className="text-xs font-bold text-gray-500 uppercase mb-2 mt-4">
                        敏感词 / 合规性
                      </div>
                    )}
                    {reviewResult.sensitive?.map((item, i) => (
                      <div
                        key={i}
                        className="p-3 border rounded mb-2 bg-orange-50 border-orange-100"
                      >
                        <div className="text-xs text-gray-500 mb-1">
                          建议修改：{item.text}
                        </div>
                        <div className="text-sm font-bold text-orange-700">
                          {item.suggestion}
                        </div>
                      </div>
                    ))}
                    {reviewResult.grammar?.length > 0 && (
                      <div className="text-xs font-bold text-gray-500 uppercase mb-2 mt-4">
                        语法建议
                      </div>
                    )}
                    {reviewResult.grammar?.map((item, i) => (
                      <div
                        key={i}
                        className="p-3 border rounded mb-2 bg-blue-50 border-blue-100"
                      >
                        <div className="text-xs text-gray-500 mb-1">
                          上下文：{item.context}
                        </div>
                        <div className="text-sm font-bold text-blue-700">
                          {item.suggestion}
                        </div>
                      </div>
                    ))}
                  </>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
