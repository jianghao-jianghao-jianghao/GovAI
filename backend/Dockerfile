FROM python:3.12-slim-bookworm

ARG http_proxy
ARG https_proxy
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG ALL_PROXY
ARG all_proxy
ARG NO_PROXY
ARG no_proxy
ARG DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# ── 安装系统依赖：fontconfig + Chromium 运行时依赖 ──
RUN export http_proxy="${http_proxy}" https_proxy="${https_proxy}" HTTP_PROXY="${HTTP_PROXY}" HTTPS_PROXY="${HTTPS_PROXY}" ALL_PROXY="${ALL_PROXY}" all_proxy="${all_proxy}" NO_PROXY="${NO_PROXY}" no_proxy="${no_proxy}" DEBIAN_FRONTEND="${DEBIAN_FRONTEND}" \
    && rm -f /etc/apt/apt.conf.d/docker-clean \
    && sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-noto-cjk \
    # Chromium 运行时必需的共享库 \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# ── 安装公文专用中文字体 + Times New Roman ──
COPY fonts/ /usr/share/fonts/truetype/govai/

# ── fontconfig 别名配置：让 "仿宋_GB2312" 等名称正确映射到实际字体文件 ──
COPY fonts-conf/local.conf /etc/fonts/local.conf
RUN fc-cache -fv

# ── 安装 Python 依赖 ──
COPY requirements.txt .
RUN export http_proxy="${http_proxy}" https_proxy="${https_proxy}" HTTP_PROXY="${HTTP_PROXY}" HTTPS_PROXY="${HTTPS_PROXY}" ALL_PROXY="${ALL_PROXY}" all_proxy="${all_proxy}" NO_PROXY="${NO_PROXY}" no_proxy="${no_proxy}" \
    && pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# ── 安装 Playwright Chromium 浏览器（使用官方 CDN 列表） ──
RUN export http_proxy="${http_proxy}" https_proxy="${https_proxy}" HTTP_PROXY="${HTTP_PROXY}" HTTPS_PROXY="${HTTPS_PROXY}" ALL_PROXY="${ALL_PROXY}" all_proxy="${all_proxy}" NO_PROXY="${NO_PROXY}" no_proxy="${no_proxy}" \
    && playwright install chromium

# ── 复制代码 ──
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
