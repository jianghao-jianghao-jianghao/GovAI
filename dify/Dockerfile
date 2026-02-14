# Dify 集成 Docker 镜像
# 用于快速部署和测试

FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY services/ ./services/
COPY .env.example .env

# 暴露端口（如果运行 FastAPI）
EXPOSE 8000

# 默认命令（可根据实际情况调整）
CMD ["uvicorn", "services.dify.api:router", "--host", "0.0.0.0", "--port", "8000"]
