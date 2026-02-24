# 用于前端打包和部署的 Dockerfile
# 基于 node:lts 进行构建，nginx 进行部署

# ---------- 构建阶段 ----------
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g pnpm && \
    pnpm config set registry https://registry.npmmirror.com && \
    pnpm install
COPY . ./
RUN rm -rf node_modules/.cache && pnpm run build

# ---------- 部署阶段 ----------
FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY --from=build /app/dist .
COPY ./nginx.conf /etc/nginx/nginx.conf

# 可选：暴露端口
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
