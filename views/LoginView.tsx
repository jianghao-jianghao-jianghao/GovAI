import React, { useState } from "react";
import { AlertOctagon, CheckCircle2, Loader2, UserPlus, LogIn } from "lucide-react";
import { apiLogin, apiRegister } from "../api";

export const LoginView = ({ onLogin }) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setDisplayName("");
    setDepartment("");
    setError("");
    setSuccessMsg("");
  };

  const switchMode = (m: "login" | "register") => {
    resetForm();
    setMode(m);
  };

  const handleLogin = async () => {
    if (!username || !password) {
      setError("请输入用户名和密码");
      return;
    }
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      const { user } = await apiLogin(username, password);
      onLogin(user);
    } catch (err: any) {
      setError(
        err.message === "TOKEN_EXPIRED"
          ? "请重新登录"
          : err.message || "登录失败",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username || !password || !displayName) {
      setError("请填写用户名、密码和姓名");
      return;
    }
    if (username.length < 2) {
      setError("用户名至少2个字符");
      return;
    }
    if (password.length < 6) {
      setError("密码至少6个字符");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      await apiRegister({
        username,
        password,
        display_name: displayName,
        department: department || undefined,
      });
      setSuccessMsg("注册成功！账号需要管理员审批后才能登录，请联系管理员。");
      setTimeout(() => {
        resetForm();
        setMode("login");
      }, 3000);
    } catch (err: any) {
      setError(err.message || "注册失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = mode === "login" ? handleLogin : handleRegister;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-[#0f172a] p-10 text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-3xl shadow-lg mx-auto mb-4">
            G
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">
            GovAI 智政
          </h1>
          <p className="text-blue-200 text-sm mt-2">私有化智能公文与问答系统</p>
        </div>
        <div className="p-8 space-y-6">
          {/* 登录/注册 Tab 切换 */}
          <div className="flex rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => switchMode("login")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all ${
                mode === "login"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <LogIn size={15} />
              登录
            </button>
            <button
              onClick={() => switchMode("register")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all ${
                mode === "register"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <UserPlus size={15} />
              注册
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded text-sm text-center border border-red-100 flex items-center justify-center">
              <AlertOctagon size={16} className="mr-2" />
              {error}
            </div>
          )}
          {successMsg && (
            <div className="bg-green-50 text-green-600 p-3 rounded text-sm text-center border border-green-100 flex items-center justify-center">
              <CheckCircle2 size={16} className="mr-2" />
              {successMsg}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                用户名
              </label>
              <input
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === "login" ? "请输入用户名" : "设置用户名（至少2个字符）"}
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  姓名 <span className="text-red-400">*</span>
                </label>
                <input
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="请输入真实姓名"
                />
              </div>
            )}

            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  部门 <span className="text-gray-400 text-xs">（选填）</span>
                </label>
                <input
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="请输入所属部门"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                密码
              </label>
              <input
                type="password"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "login" ? "请输入密码" : "设置密码（至少6个字符）"}
                onKeyDown={(e) => e.key === "Enter" && mode === "login" && handleLogin()}
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  确认密码
                </label>
                <input
                  type="password"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入密码"
                  onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                />
              </div>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg transition-colors shadow-lg shadow-blue-200 disabled:opacity-70 flex items-center justify-center"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin mr-2" />
                {mode === "login" ? "登录中..." : "注册中..."}
              </>
            ) : mode === "login" ? (
              "登 录 系 统"
            ) : (
              "注 册 账 号"
            )}
          </button>

          {mode === "register" && (
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              注册后需管理员审批激活，审批通过后方可登录使用系统
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
