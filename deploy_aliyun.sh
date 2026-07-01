#!/bin/bash
set -e

# ============================================================
# 金石立美订单管理系统 - 阿里云一键部署脚本
# 适用于 Ubuntu 22.04/24.04 LTS
# 用法: ssh root@服务器IP < deploy.sh
# 或者: chmod +x deploy.sh && ./deploy.sh
# ============================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }

# ── 1. 安装 Node.js 22 LTS ──
log "安装 Node.js 22 LTS..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs 2>&1 | tail -1
log "Node.js $(node -v) / npm $(npm -v)"

# ── 2. 安装 PM2 进程守护 ──
log "安装 PM2..."
npm install -g pm2 2>&1 | tail -1
log "PM2 $(pm2 -v)"

# ── 3. 从 GitHub 拉取代码 ──
APP_DIR="/opt/order-system"
log "克隆代码到 $APP_DIR..."
rm -rf "$APP_DIR" 2>/dev/null
git clone --depth 1 https://github.com/ericlu892/order-system.git "$APP_DIR"

# ── 4. 安装依赖 ──
log "安装项目依赖..."
cd "$APP_DIR/server"
npm install 2>&1 | tail -3

# ── 5. 创建数据目录 ──
mkdir -p "$APP_DIR/data"
mkdir -p "$APP_DIR/server/public/uploads"

# ── 6. 配置防火墙（开放 8765 端口） ──
log "配置防火墙..."
ufw allow 8765/tcp >/dev/null 2>&1 || true
ufw reload >/dev/null 2>&1 || true

# ── 7. 用 PM2 启动服务 ──
log "启动服务..."
cd "$APP_DIR/server"
pm2 delete order-system 2>/dev/null || true
PORT=8765 pm2 start server_new.js --name "order-system" -- -p 8765
pm2 save
pm2 startup systemd -u root --hp /root 2>&1 | tail -3

# ── 8. 验证 ──
sleep 2
log "检查服务状态..."
curl -s http://localhost:8765/api/dashboard -H "Authorization: Bearer $(curl -s http://localhost:8765/api/login -X POST -H 'Content-Type: application/json' -d '{\"username\":\"admin\",\"password\":\"admin123\"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)" | head -c 200 || warn "Dashboard 验证暂不可用，请等待服务就绪"

echo ""
log "========================================"
log " ✅ 部署完成！"
log "========================================"
log ""
log " 本地访问: http://localhost:8765/index_new.html"
log " 服务器访问: http://$(curl -s ifconfig.me):8765/index_new.html"
log " 账号: admin / admin123"
log ""
log " PM2 管理命令:"
log "   pm2 status             # 查看状态"
log "   pm2 logs order-system   # 查看日志"
log "   pm2 restart order-system # 重启服务"
log ""
log "========================================"
