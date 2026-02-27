FROM python:3.12-slim

WORKDIR /converter

# ── 切换 apt 源为清华镜像 ──
RUN echo "deb http://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm main contrib non-free non-free-firmware" > /etc/apt/sources.list && \
    echo "deb http://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm-updates main contrib non-free non-free-firmware" >> /etc/apt/sources.list && \
    echo "deb http://mirrors.tuna.tsinghua.edu.cn/debian-security bookworm-security main contrib non-free non-free-firmware" >> /etc/apt/sources.list

# ── 安装 LibreOffice + WeasyPrint 系统依赖 + 字体管理工具 + 开源中文字体 ──
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-core \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    fontconfig \
    fonts-noto-cjk \
    fonts-wqy-zenhei \
    fonts-wqy-microhei \
    # WeasyPrint 所需的系统库 (pango + cairo + gdk-pixbuf)
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libffi8 \
    && rm -rf /var/lib/apt/lists/*

# ── 安装公文专用中文字体（从 backend/fonts 复制） ──
# 包含：仿宋/楷体/黑体/宋体/微软雅黑/华文系列/Times New Roman/方正小标宋
COPY backend/fonts/ /usr/share/fonts/truetype/govai/
RUN fc-cache -fv

# ── 确保 LibreOffice 输出 UTF-8 ──
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8

COPY converter/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

COPY converter/app.py .

EXPOSE 8001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]

