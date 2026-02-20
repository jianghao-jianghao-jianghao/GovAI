import React, { useState } from "react";
import { AlertOctagon, Loader2 } from "lucide-react";
import { apiLogin } from "../api";

export const LoginView = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      setError("请输入用户名和密码");
      return;
    }
    setError("");
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

  const fillCreds = (u, p) => {
    setUsername(u);
    setPassword(p);
    setError("");
  };

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
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded text-sm text-center border border-red-100 flex items-center justify-center">
              <AlertOctagon size={16} className="mr-2" />
              {error}
            </div>
          )}
          <div className="flex gap-2 justify-center mb-2">
            <button
              onClick={() => fillCreds("admin", "admin123")}
              className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded text-gray-600"
            >
              填充 Admin
            </button>
            <button
              onClick={() => fillCreds("user", "user123")}
              className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded text-gray-600"
            >
              填充 User
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                用户名
              </label>
              <input
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                密码
              </label>
              <input
                type="password"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
          </div>
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg transition-colors shadow-lg shadow-blue-200 disabled:opacity-70 flex items-center justify-center"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin mr-2" />
                登录中...
              </>
            ) : (
              "登 录 系 统"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
