import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  MessageCircle,
  Plus,
  Folder,
  Edit3,
  Trash2,
  Download,
  Upload,
  Loader2,
  FolderOpen,
  Eye,
  CloudUpload,
  Search,
  Share2,
} from "lucide-react";
import {
  apiListCollections,
  apiCreateCollection,
  apiUpdateCollection,
  apiDeleteCollection,
  apiListFiles,
  apiUploadFiles,
  apiRenameFile,
  apiDeleteFile,
  apiBatchExportFiles,
  apiGetFileMarkdown,
  apiExtractGraphForFile,
  formatFileSize,
  apiListQaPairs,
  apiListQaCategories,
  apiSaveQaPair,
  apiUpdateQaPair,
  apiDeleteQaPair,
  type KBCollection,
  type KBFile,
  type QAPair,
} from "../api";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PERMISSIONS } from "../constants";
import { EmptyState, Modal, useConfirm } from "../components/ui";

const FILE_STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: "已索引", cls: "bg-green-100 text-green-700" },
  indexing: { label: "索引中", cls: "bg-yellow-100 text-yellow-700" },
  error: { label: "索引失败", cls: "bg-red-100 text-red-700" },
  pending: { label: "排队中", cls: "bg-gray-100 text-gray-500" },
};

const GRAPH_STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: "已抽取", cls: "bg-emerald-100 text-emerald-700" },
  extracting: { label: "抽取中", cls: "bg-blue-100 text-blue-700" },
  failed: { label: "抽取失败", cls: "bg-red-100 text-red-700" },
  skipped: { label: "已跳过", cls: "bg-gray-100 text-gray-500" },
};

export const KBView = ({
  toast,
  currentUser,
}: {
  toast: any;
  currentUser: any;
}) => {
  const { confirm, ConfirmDialog } = useConfirm();
  const [subView, setSubView] = useState("files");
  const [collections, setCollections] = useState<KBCollection[]>([]);
  const [activeCol, setActiveCol] = useState<string | null>(null);
  const [files, setFiles] = useState<KBFile[]>([]);
  const [qaPairs, setQaPairs] = useState<QAPair[]>([]);
  const [qaSearch, setQaSearch] = useState("");
  const [qaSearchInput, setQaSearchInput] = useState("");
  const [qaCategory, setQaCategory] = useState("");
  const [qaCategories, setQaCategories] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<KBFile | null>(null);
  const [previewContent, setPreviewContent] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editingCollection, setEditingCollection] = useState<any>(null);
  const [editingFile, setEditingFile] = useState<KBFile | null>(null);
  const [editingQa, setEditingQa] = useState<any>(null);
  const [selectedFiles, setSelectedFiles] = useState(new Set<string>());
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canCreateCollection = currentUser?.permissions?.includes(
    PERMISSIONS.RES_KB_MANAGE_ALL,
  );
  const canManageQa = currentUser?.permissions?.includes(
    PERMISSIONS.RES_QA_MANAGE,
  );
  const activeCollection = collections.find((c) => c.id === activeCol);
  const canManageActive = activeCollection?.can_manage ?? false;

  /* ── 数据加载 ── */
  const loadCollections = async () => {
    try {
      const data = await apiListCollections();
      setCollections(data);
      if (
        data.length > 0 &&
        (!activeCol || !data.find((c) => c.id === activeCol))
      ) {
        setActiveCol(data[0].id);
      }
    } catch (err: any) {
      toast.error("加载集合失败: " + err.message);
    }
  };
  const loadFiles = async (colId: string) => {
    try {
      const data = await apiListFiles(colId);
      setFiles(data.items);
    } catch (err: any) {
      toast.error("加载文件失败: " + err.message);
    }
  };
  const loadQaPairs = async () => {
    try {
      const filters: { keyword?: string; category?: string } = {};
      if (qaSearch) filters.keyword = qaSearch;
      if (qaCategory) filters.category = qaCategory;
      const data = await apiListQaPairs(
        1,
        100,
        Object.keys(filters).length > 0 ? filters : undefined,
      );
      setQaPairs(data.items);
    } catch (err: any) {
      toast.error("加载QA失败: " + err.message);
    }
  };
  const loadQaCategories = async () => {
    try {
      const cats = await apiListQaCategories();
      setQaCategories(cats);
    } catch {
      // fallback
      setQaCategories(["通用", "公文规范", "政策法规", "业务流程", "系统操作", "对话反馈"]);
    }
  };

  useEffect(() => {
    loadCollections();
  }, []);
  useEffect(() => {
    if (activeCol) {
      loadFiles(activeCol);
      setSelectedFiles(new Set());
    } else {
      setFiles([]);
    }
  }, [activeCol]);
  useEffect(() => {
    if (subView === "qa") {
      loadQaPairs();
      loadQaCategories();
    }
  }, [subView, qaSearch, qaCategory]);

  /* ── 集合操作 ── */
  const handleCreateCollection = async (name: string) => {
    if (!name.trim()) return;
    try {
      if (editingCollection?.id) {
        await apiUpdateCollection(editingCollection.id, { name });
        toast.success("集合重命名成功");
      } else {
        await apiCreateCollection({ name });
        toast.success("集合创建成功");
      }
      loadCollections();
    } catch (err: any) {
      toast.error(err.message);
    }
    setEditingCollection(null);
  };
  const handleDeleteCollection = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (
      !(await confirm({
        message: "确定删除此集合及其所有文档吗？",
        variant: "danger",
        confirmText: "删除",
      }))
    )
      return;
    try {
      await apiDeleteCollection(id);
      if (activeCol === id) setActiveCol(null);
      loadCollections();
      toast.success("集合已删除");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  /* ── 文件操作 ── */
  const handleBatchUpload = async (fileList: FileList) => {
    if (!activeCol) return toast.error("请先选择或创建一个知识集合");
    if (!canManageActive) return toast.error("无权在此集合上传文档");
    setUploading(true);
    try {
      const result = await apiUploadFiles(activeCol, fileList);
      if (result.uploaded.length > 0)
        toast.success(`成功上传 ${result.uploaded.length} 个文档`);
      if (result.failed.length > 0) {
        const reasons = result.failed.map((f) => `${f.name}: ${f.error}`).join("\n");
        toast.error(`${result.failed.length} 个文件上传失败\n${reasons}`);
      }
      loadFiles(activeCol);
    } catch (err: any) {
      toast.error("上传失败: " + err.message);
    } finally {
      setUploading(false);
    }
  };
  const handleRenameFile = async (name: string) => {
    if (!name.trim() || !editingFile) return;
    try {
      await apiRenameFile(editingFile.id, name);
      toast.success("文档重命名成功");
      if (activeCol) loadFiles(activeCol);
    } catch (err: any) {
      toast.error(err.message);
    }
    setEditingFile(null);
  };
  const handleDeleteFile = async (id: string) => {
    if (
      !(await confirm({
        message: "确定删除此文档？索引将失效。",
        variant: "danger",
        confirmText: "删除",
      }))
    )
      return;
    try {
      await apiDeleteFile(id);
      toast.success("文档已删除");
      if (activeCol) loadFiles(activeCol);
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  const handleBatchExport = async () => {
    if (selectedFiles.size === 0) return;
    try {
      const blob = await apiBatchExportFiles(Array.from(selectedFiles));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kb_export_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`已开始打包下载 ${selectedFiles.size} 个文件`);
    } catch (err: any) {
      toast.error("导出失败: " + err.message);
    }
  };
  const handlePreview = async (f: KBFile) => {
    setPreviewFile(f);
    setPreviewContent("");
    setPreviewLoading(true);
    try {
      const d = await apiGetFileMarkdown(f.id);
      setPreviewContent(d.markdown);
    } catch {
      setPreviewContent("");
    } finally {
      setPreviewLoading(false);
    }
  };

  /* ── QA 操作 ── */
  const handleSaveQa = async (qa: any) => {
    try {
      if (qa.id) {
        await apiUpdateQaPair(qa.id, {
          question: qa.question,
          answer: qa.answer,
          category: qa.category,
        });
      } else {
        await apiSaveQaPair({
          question: qa.question,
          answer: qa.answer,
          category: qa.category,
        });
      }
      toast.success("问答对已保存");
      loadQaPairs();
    } catch (err: any) {
      toast.error(err.message);
    }
    setEditingQa(null);
  };
  const handleDeleteQa = async (id: string) => {
    if (
      !(await confirm({
        message: "确定删除此问答对？",
        variant: "danger",
        confirmText: "删除",
      }))
    )
      return;
    try {
      await apiDeleteQaPair(id);
      toast.success("问答对已删除");
      loadQaPairs();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  /* ── 选择/拖拽 ── */
  const toggleSelectAll = () => {
    if (selectedFiles.size === files.length) setSelectedFiles(new Set());
    else setSelectedFiles(new Set(files.map((f) => f.id)));
  };
  const toggleSelectOne = (id: string) => {
    const s = new Set(selectedFiles);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelectedFiles(s);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length > 0)
      handleBatchUpload(e.dataTransfer.files);
  };
  const handleFileInputChange = (e) => {
    if (e.target.files?.length > 0) handleBatchUpload(e.target.files);
    e.target.value = "";
  };

  /* ── 子组件 ── */
  const CollectionModal = ({ col, onSave, onCancel }) => {
    const [name, setName] = useState(col?.name || "");
    return (
      <Modal
        title={col?.id ? "重命名集合" : "新建集合"}
        onClose={onCancel}
        size="sm"
        footer={
          <button
            onClick={() => onSave(name)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            保存
          </button>
        }
      >
        <div>
          <label className="block text-sm font-medium mb-1">集合名称</label>
          <input
            className="w-full border rounded p-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
      </Modal>
    );
  };
  const FileRenameModal = ({ file, onSave, onCancel }) => {
    const [name, setName] = useState(file?.name || "");
    return (
      <Modal
        title="重命名文档"
        onClose={onCancel}
        size="sm"
        footer={
          <button
            onClick={() => onSave(name)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            保存
          </button>
        }
      >
        <div>
          <label className="block text-sm font-medium mb-1">文档名称</label>
          <input
            className="w-full border rounded p-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
      </Modal>
    );
  };
  const QaEditorModal = ({ qa, onSave, onCancel }) => {
    const [formData, setFormData] = useState(
      qa || { question: "", answer: "", category: "通用" },
    );
    return (
      <Modal
        title={qa ? "编辑问答对" : "新建问答对"}
        onClose={onCancel}
        footer={
          <button
            onClick={() => onSave(formData)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            保存
          </button>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">问题</label>
            <textarea
              className="w-full border rounded p-2 h-20"
              value={formData.question}
              onChange={(e) =>
                setFormData({ ...formData, question: e.target.value })
              }
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">答案</label>
            <textarea
              className="w-full border rounded p-2 h-32"
              value={formData.answer}
              onChange={(e) =>
                setFormData({ ...formData, answer: e.target.value })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">分类</label>
            <select
              className="w-full border rounded p-2 bg-white"
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
            >
              {qaCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="h-12 border-b flex items-center px-4 space-x-1 bg-gray-50">
        <button
          onClick={() => setSubView("files")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors relative top-[1px] border-b-2 ${subView === "files" ? "bg-white text-blue-600 border-blue-600" : "text-gray-500 border-transparent hover:text-gray-700"}`}
        >
          <div className="flex items-center">
            <FileText size={14} className="mr-2" /> 文档管理
          </div>
        </button>
        {canManageQa && (
          <button
            onClick={() => setSubView("qa")}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors relative top-[1px] border-b-2 ${subView === "qa" ? "bg-white text-purple-600 border-purple-600" : "text-gray-500 border-transparent hover:text-gray-700"}`}
          >
            <div className="flex items-center">
              <MessageCircle size={14} className="mr-2" /> QA问答库
            </div>
          </button>
        )}
      </div>

      {subView === "files" && (
        <div className="flex-1 flex gap-0 h-full overflow-hidden">
          <div className="w-64 bg-white border-r flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-white">
              <span className="font-bold text-gray-700 text-xs uppercase tracking-wider">
                知识集合
              </span>
              {canCreateCollection && (
                <button
                  onClick={() => setEditingCollection({})}
                  className="p-1 hover:bg-gray-100 rounded text-gray-600"
                  title="新建集合"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {collections.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setActiveCol(c.id)}
                  className={`group flex items-center justify-between p-3 rounded cursor-pointer text-sm ${activeCol === c.id ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"}`}
                >
                  <div className="flex items-center truncate">
                    <Folder
                      size={16}
                      className={`mr-2 flex-shrink-0 ${activeCol === c.id ? "text-blue-500" : "text-yellow-500"}`}
                    />
                    <span className="truncate">{c.name}</span>
                    {!c.can_manage && (
                      <span className="ml-2 text-[10px] bg-gray-100 text-gray-400 px-1 rounded">
                        只读
                      </span>
                    )}
                  </div>
                  {c.can_manage && (
                    <div className="hidden group-hover:flex items-center space-x-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCollection(c);
                        }}
                        className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-blue-600"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteCollection(e, c.id)}
                        className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-red-500"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {collections.length === 0 && (
                <div className="text-center text-gray-400 text-xs py-4">
                  暂无可见集合
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 flex flex-col bg-white">
            <div className="p-4 border-b flex justify-between items-center bg-white">
              <div className="flex items-center">
                <h2 className="text-lg font-bold text-gray-800 flex items-center mr-4">
                  {activeCol ? activeCollection?.name : "未选择集合"}
                </h2>
                {selectedFiles.size > 0 && (
                  <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-left-2">
                    <span className="text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-full font-medium">
                      已选 {selectedFiles.size} 项
                    </span>
                    <button
                      onClick={handleBatchExport}
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded"
                      title="批量导出"
                    >
                      <Download size={18} />
                    </button>
                  </div>
                )}
              </div>
              {canManageActive && (
                <>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileInputChange}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || !activeCol}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg flex items-center hover:bg-blue-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? (
                      <Loader2 className="animate-spin mr-2" />
                    ) : (
                      <Upload size={18} className="mr-2" />
                    )}{" "}
                    上传文档
                  </button>
                </>
              )}
            </div>
            <div
              className={`flex-1 overflow-auto p-6 relative transition-colors ${isDragOver ? "bg-blue-50 border-2 border-dashed border-blue-400" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragOver && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10 pointer-events-none">
                  <CloudUpload
                    size={64}
                    className="text-blue-500 mb-4 animate-bounce"
                  />
                  <h3 className="text-xl font-bold text-blue-600">
                    释放文件以批量上传
                  </h3>
                </div>
              )}
              {activeCol ? (
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          className="rounded cursor-pointer"
                          checked={
                            files.length > 0 &&
                            selectedFiles.size === files.length
                          }
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th className="p-3">名称</th>
                      <th className="p-3">类型</th>
                      <th className="p-3">大小</th>
                      <th className="p-3">索引</th>
                      <th className="p-3">图谱</th>
                      <th className="p-3 w-40">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {files.map((f) => {
                      const st = FILE_STATUS[f.status] || FILE_STATUS.completed;
                      return (
                        <tr
                          key={f.id}
                          className={`hover:bg-gray-50 group ${selectedFiles.has(f.id) ? "bg-blue-50/50" : ""}`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              className="rounded cursor-pointer"
                              checked={selectedFiles.has(f.id)}
                              onChange={() => toggleSelectOne(f.id)}
                            />
                          </td>
                          <td className="p-3 font-medium flex items-center">
                            <FileText
                              size={16}
                              className="text-gray-400 mr-2"
                            />{" "}
                            {f.name}
                          </td>
                          <td className="p-3 uppercase text-gray-500">
                            {f.file_type}
                          </td>
                          <td className="p-3 text-gray-500">
                            {formatFileSize(f.file_size)}
                          </td>
                          <td className="p-3">
                            <span
                              className={`${st.cls} px-2 py-0.5 rounded text-xs`}
                            >
                              {st.label}
                            </span>
                          </td>
                          <td className="p-3">
                            {(() => {
                              const gs = f.graph_status
                                ? GRAPH_STATUS[f.graph_status] || {
                                    label: f.graph_status,
                                    cls: "bg-gray-100 text-gray-500",
                                  }
                                : null;
                              if (!gs)
                                return (
                                  <span className="text-gray-300 text-xs">
                                    —
                                  </span>
                                );
                              return (
                                <span
                                  className={`${gs.cls} px-2 py-0.5 rounded text-xs cursor-default`}
                                  title={
                                    f.graph_error
                                      ? `${gs.label}: ${f.graph_error}`
                                      : f.graph_node_count
                                        ? `${f.graph_node_count} 节点 / ${f.graph_edge_count} 边`
                                        : gs.label
                                  }
                                >
                                  {gs.label}
                                  {f.graph_node_count
                                    ? ` (${f.graph_node_count})`
                                    : ""}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center space-x-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handlePreview(f)}
                                className="text-blue-600 hover:text-blue-800"
                                title="预览"
                              >
                                <Eye size={16} />
                              </button>
                              {canManageActive && f.status === "completed" && (
                                <button
                                  onClick={async () => {
                                    try {
                                      toast({
                                        type: "info",
                                        message: "正在抽取知识图谱…",
                                      });
                                      const r = await apiExtractGraphForFile(
                                        f.id,
                                      );
                                      toast({
                                        type: "success",
                                        message: `抽取完成: ${r.nodes_created} 节点, ${r.edges_created} 边`,
                                      });
                                      if (activeCol) loadFiles(activeCol);
                                    } catch (e: any) {
                                      toast({
                                        type: "error",
                                        message: e?.message || "图谱抽取失败",
                                      });
                                    }
                                  }}
                                  className="text-purple-500 hover:text-purple-700"
                                  title={
                                    f.graph_status === "completed"
                                      ? "重新抽取图谱"
                                      : "抽取知识图谱"
                                  }
                                >
                                  <Share2 size={16} />
                                </button>
                              )}
                              {canManageActive && (
                                <>
                                  <button
                                    onClick={() => setEditingFile(f)}
                                    className="text-gray-500 hover:text-blue-600"
                                    title="重命名"
                                  >
                                    <Edit3 size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteFile(f.id)}
                                    className="text-gray-500 hover:text-red-600"
                                    title="删除"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <EmptyState
                  icon={FolderOpen}
                  title="未选择集合"
                  desc="请从左侧选择一个知识集合来管理文档"
                  action={null}
                />
              )}
              {activeCol && files.length === 0 && (
                <EmptyState
                  icon={FileText}
                  title="暂无文档"
                  desc={
                    canManageActive
                      ? "点击右上角上传按钮，或拖拽文件到此处"
                      : "当前集合暂无文档"
                  }
                  action={null}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {subView === "qa" && (
        <div className="flex-1 flex flex-col bg-white animate-in fade-in">
          <div className="p-4 border-b bg-gray-50">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800 flex items-center">
                QA 问答库管理
              </h2>
              <button
                onClick={() => setEditingQa({})}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg flex items-center hover:bg-purple-700 shadow-sm"
              >
                <Plus size={18} className="mr-2" /> 新增问答对
              </button>
            </div>
            <div className="flex items-center gap-3 mt-3">
              {/* 分类筛选 */}
              <select
                className="border rounded-lg px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-purple-200 outline-none min-w-[120px]"
                value={qaCategory}
                onChange={(e) => setQaCategory(e.target.value)}
              >
                <option value="">全部分类</option>
                {qaCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {/* 搜索框 */}
              <div className="relative flex-1 max-w-md flex">
                <div className="relative flex-1">
                  <Search
                    size={14}
                    className="absolute left-3 top-2.5 text-gray-400"
                  />
                  <input
                    className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-l-full bg-white focus:ring-2 focus:ring-purple-200 outline-none"
                    placeholder="搜索问题、答案或分类..."
                    value={qaSearchInput}
                    onChange={(e) => setQaSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setQaSearch(qaSearchInput);
                      }
                    }}
                  />
                </div>
                <button
                  onClick={() => setQaSearch(qaSearchInput)}
                  className="px-4 py-1.5 bg-purple-600 text-white text-sm rounded-r-full hover:bg-purple-700 flex items-center"
                >
                  <Search size={14} className="mr-1" /> 搜索
                </button>
              </div>
              {/* 清除筛选 */}
              {(qaSearch || qaCategory) && (
                <button
                  onClick={() => {
                    setQaSearchInput("");
                    setQaSearch("");
                    setQaCategory("");
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center"
                >
                  清除筛选
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <table className="w-full text-sm text-left">
              <thead className="bg-purple-50 text-purple-900">
                <tr>
                  <th className="p-4 w-1/4">问题</th>
                  <th className="p-4 w-1/2">答案</th>
                  <th className="p-4">分类</th>
                  <th className="p-4 w-32 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {qaPairs.map((qa) => (
                  <tr key={qa.id} className="hover:bg-gray-50 group">
                    <td className="p-4 font-bold text-gray-800 align-top">
                      {qa.question}
                    </td>
                    <td className="p-4 text-gray-600 align-top whitespace-pre-wrap">
                      {qa.answer}
                    </td>
                    <td className="p-4 align-top">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        qa.category === "公文规范" ? "bg-blue-100 text-blue-700" :
                        qa.category === "政策法规" ? "bg-amber-100 text-amber-700" :
                        qa.category === "业务流程" ? "bg-green-100 text-green-700" :
                        qa.category === "系统操作" ? "bg-cyan-100 text-cyan-700" :
                        qa.category === "对话反馈" ? "bg-purple-100 text-purple-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {qa.category}
                      </span>
                    </td>
                    <td className="p-4 align-top text-right space-x-2">
                      {canManageQa && (
                        <>
                          <button
                            onClick={() => setEditingQa(qa)}
                            className="text-blue-600 hover:underline"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDeleteQa(qa.id)}
                            className="text-red-600 hover:underline"
                          >
                            删除
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {qaPairs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-gray-400">
                      <MessageCircle
                        size={48}
                        className="mb-4 text-gray-200 mx-auto"
                      />
                      <p>暂无QA问答对</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {previewFile && (
        <Modal
          title={
            <div className="flex items-center">
              <FileText size={16} className="mr-2 text-blue-500" />
              <span>{previewFile.name}</span>
              <span className="ml-2 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-normal">
                {previewFile.file_type?.toUpperCase()}
              </span>
            </div>
          }
          onClose={() => {
            setPreviewFile(null);
            setPreviewContent("");
          }}
          size="lg"
          footer={null}
        >
          <div className="h-[70vh] overflow-auto">
            {previewLoading ? (
              <div className="flex items-center justify-center h-full text-gray-400 flex-col">
                <Loader2
                  size={32}
                  className="animate-spin mb-4 text-blue-400"
                />
                <p className="text-sm">正在加载预览内容...</p>
              </div>
            ) : previewContent ? (
              <div className="govai-markdown px-2 py-1 text-sm text-gray-700 leading-relaxed">
                <Markdown remarkPlugins={[remarkGfm]}>
                  {previewContent}
                </Markdown>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 flex-col">
                <FileText size={48} className="mb-4 text-gray-300" />
                <p className="text-sm">暂无预览内容</p>
                <p className="text-xs text-gray-300 mt-1">
                  文档尚未转换为 Markdown 或不支持预览
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
      {editingCollection && (
        <CollectionModal
          col={editingCollection.id ? editingCollection : null}
          onSave={handleCreateCollection}
          onCancel={() => setEditingCollection(null)}
        />
      )}
      {editingFile && (
        <FileRenameModal
          file={editingFile}
          onSave={handleRenameFile}
          onCancel={() => setEditingFile(null)}
        />
      )}
      {editingQa && (
        <QaEditorModal
          qa={editingQa.id ? editingQa : null}
          onSave={handleSaveQa}
          onCancel={() => setEditingQa(null)}
        />
      )}
      {ConfirmDialog}
    </div>
  );
};
