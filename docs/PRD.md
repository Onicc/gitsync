
## 1. 核心功能规格 (Feature Specifications)

### 1.1 仓库同步引擎

* **镜像备份 (Mirroring):** 使用 `git clone --mirror` 和 `git push --mirror` 确保所有分支、标签（Tags）和提交记录完整同步。
* **Submodule 支持:** 自动识别并递归同步子模块，确保仓库完整性。
* **增量更新:** 首次同步后，后续仅拉取和推送变更部分，节省带宽。
* **自动创建仓库:** 若目的端不存在该仓库，系统需调用 GitHub/Gitee/GitLab 的 API 自动创建（需对应 Token 拥有相应权限）。

### 1.2 认证与安全管理

* **SSH 管理:**
    * 支持在 Web 端一键生成 SSH Key 对（RSA 或 ED25519）。
    * 提供公钥复制功能，用户可手动将其添加至各平台。
    * SSH Key 为全局凭据，可用于所有平台和账户。

* **Token 管理:**
    * 集中存储各平台的 Personal Access Tokens (PAT)。
    * **多账户支持:** 同一平台可存储多个账户的 Token（如管理两个 GitHub 账户）。
    * 创建 Token 时需输入**用户 ID**（GitHub username、GitLab username 等）。
    * 执行 Git 操作时，系统自动解析仓库 URL 中的用户/组织 ID，匹配对应的 Token。

* **凭据存储:** 数据库中加密存储 Token。

* **凭据匹配逻辑:**
    * **使用 Token 时:** 从仓库 URL 提取用户 ID（如 `github.com/user123/repo` 中的 `user123`），匹配数据库中对应平台和用户 ID 的 Token。
    * **使用 SSH 时:** 直接使用全局 SSH Key，无需匹配用户 ID。

### 1.3 任务调度与管理

* **Cron 表达式:** 支持标准的 Cron 表达式设置备份频率（如每小时、每天凌晨 2 点等）。
* **队列管理:** 支持多任务并发备份，但对同一目标地址的任务进行排队。
* **控制操作:**
    * **立即备份:** 手动触发一次同步。
    * **暂停/恢复:** 临时停止定时任务。
    * **CRUD:** 支持对备份对的增加、删除、修改映射关系。



---

## 2. 界面设计与交互 (UI/UX)

### 2.1 仪表盘 (Dashboard)

* **全局状态:** 显示“成功”、“运行中”、“失败”的任务总数。
* **实时动态:** 类似 CI/CD 的滚动日志流，显示当前正在进行的同步进度。

### 2.2 同步任务列表 (Sync Tasks)

| 任务名称 | 源仓库 (Source) | 目的地 (Destination) | 上次成功时间 | 状态 | 操作 |
| --- | --- | --- | --- | --- | --- |
| Project-A | GitHub: user/repo | Local: /backups/a | 2026-02-10 | ✅ 成功 | 立即同步 / 暂停 / 配置 |
| AI-Model | GitLab: lab/model | Gitee: user/model | 2026-02-09 | ❌ 失败 | 查看日志 / 编辑 |

### 2.3 错误诊断

* **错误回显:** 备份失败时，直接在网页前端展示 `git stderr` 输出。
* **重试机制:** 支持配置失败后自动重试的次数（如重试 3 次）。

---

## 3. 技术实现架构 (Technical Stack)

### 3.1 核心组件

* **Backend:** Python (FastAPI/Django) 或 Go (Gin/Fiber) —— 负责逻辑与 API 调用。
* **Frontend:** Vue.js 或 React + Tailwind CSS —— 实现响应式美观 UI。
* **Scheduler:** APScheduler (Python) 或 Cron-style worker —— 处理定时任务。
* **Database:** SQLite (单机版) 或 PostgreSQL (集群版) —— 记录配置与日志。

### 3.2 Docker 部署方案

* **镜像基础:** 需包含 `git`、`ssh-client` 环境。
* **Docker Compose 示例:**

```yaml
services:
  gitsync:
    image: gitsync:latest
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/database    # 配置文件与数据库
      - /mnt/git_backups:/backups # 备份文件物理存放路径
      - ~/.ssh:/root/.ssh       # 可选：挂载宿主机 SSH
    environment:
      - ENCRYPT_KEY=your_secret # 用于加密 Token 的密钥

```

---

## 4. 增强建议 (Advanced Enhancements)

1. **自动发现 (Auto-Discovery):** 输入一个 GitHub 组织名，自动拉取该组织下所有仓库并创建备份任务。
2. **Webhooks 支持:** 除了定时备份，支持接收 GitHub/GitLab 的 Webhook，实现“代码一提交，立刻触发同步”。
3. **冲突预警:** 虽然 `--mirror` 是强制覆盖，但如果由于目标端开启了分支保护导致推送失败，需在网页给出明确提示。
4. **存储空间预警:** 当挂载的物理磁盘空间低于 10% 时，发送 Webhook 告警。
5. **多账户切换:** 支持管理多个 GitHub/Gitee 账户，并在创建任务时下拉选择使用哪个账户的凭据。

---

## 5. 补充完善：备份流程逻辑

1. **触发阶段:** 检查 Cron 时间或用户点击“立即同步”。
2. **环境准备:** 如果目标地址是本地路径，检查目录是否存在。
3. **鉴权注入:** 根据配置，临时将 Token 注入 URL (如 `https://token@github.com...`) 或在内存中加载 SSH Key。
4. **检查目标:** 调用平台 API（如 GitHub API）查询项目是否存在，不存在则发送 `POST /user/repos` 创建。
5. **执行同步:**
    * `git clone --mirror [Source] temp_dir`
    * `cd temp_dir && git remote set-url --push origin [Destination]`
    * `git push --mirror`


6. **结果反馈:** 更新数据库状态，如果是失败，记录错误日志到日志文件.

