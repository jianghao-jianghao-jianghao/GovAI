# ============================================================
# Apache AGE on PostgreSQL 16 — aarch64 兼容
# 官方 apache/age 镜像不支持 arm64，且 latest 已漂移到 PG18
# ============================================================

FROM postgres:16-bookworm

ENV AGE_VERSION=release/PG16/1.5.0

# 代理配置（用于 apt-get）
ARG http_proxy
ARG https_proxy
ENV http_proxy=${http_proxy}
ENV https_proxy=${https_proxy}

# 切换为清华镜像源
RUN echo "deb http://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm main contrib non-free non-free-firmware" > /etc/apt/sources.list && \
    echo "deb http://mirrors.tuna.tsinghua.edu.cn/debian/ bookworm-updates main contrib non-free non-free-firmware" >> /etc/apt/sources.list && \
    echo "deb http://mirrors.tuna.tsinghua.edu.cn/debian-security bookworm-security main contrib non-free non-free-firmware" >> /etc/apt/sources.list

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    postgresql-server-dev-16 \
    libreadline-dev \
    zlib1g-dev \
    flex \
    bison \
    && rm -rf /var/lib/apt/lists/*

COPY age_src/ /tmp/age/
RUN cd /tmp/age \
    && make install \
    && cd / && rm -rf /tmp/age

# 清理编译工具，减小镜像体积
RUN apt-get purge -y --auto-remove \
    build-essential \
    postgresql-server-dev-16 \
    libreadline-dev \
    zlib1g-dev \
    flex \
    bison \
    && rm -rf /var/lib/apt/lists/*

# 预加载 AGE 扩展
RUN echo "shared_preload_libraries = 'age'" >> /usr/share/postgresql/postgresql.conf.sample
