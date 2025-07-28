# 📦 RepoSyncer 开发文档

## 一、项目简介

**RepoSyncer** 是一个支持通过配置文件将多个 Git 仓库定期进行同步备份的工具。支持以下两种备份模式：

1. **远程仓库 → 本地目录备份**
2. **一个远程仓库 → 另一个远程仓库的镜像同步**

支持 GitHub、GitLab 等平台，只支持 **SSH 协议**。项目通过 GitHub Actions 进行跨平台编译，自动生成可在 Windows、Linux、macOS 上运行的独立二进制文件。

---

## 二、核心功能

### ✅ 1. 本地备份功能

* 定时将多个远程 Git 仓库备份到本地
* 支持完整克隆所有分支、tag、submodule
* 本地备份目录以远程仓库域名账户名分级，例如：

  ```
  git@github.com:abc/llm.git → /home/tsai/data/abc/llm
  git@github.com:dmx/chat.git → /home/tsai/data/dmx/chat
  ```

### ✅ 2. 远程仓库互相备份

* 将一个远程仓库完整备份推送到另一个远程仓库
* 同样支持所有分支、tag、submodule

### ✅ 3. 配置驱动 & 定时执行

* 所有备份配置均来自用户配置文件
* 内置定时器支持定期执行备份（按天）

---

## 三、系统架构图

```plaintext
              +--------------------------+
              |        Config File       |
              +-----------+--------------+
                          |
          +---------------+---------------+
          |                               |
+---------v--------+           +----------v----------+
|  Local Backup    |           | Remote to Remote    |
|  Module          |           | Sync Module         |
+---------+--------+           +----------+----------+
          |                               |
+---------v--------+           +----------v----------+
| SSH Git Handler  |           |   SSH Git Handler   |
+------------------+           +---------------------+
```

---

## 四、配置说明

配置文件支持 YAML/JSON，推荐使用 `config.yaml`。

### 示例配置：

```yaml
backup_local:
  interval_days: 1
  save_dir: /home/tsai/data
  repos:
    - git@github.com:abc/llm.git
    - git@github.com:dmx/chat.git

backup_remote:
  pairs:
    - src: git@github.com:abc/llm.git
      dst: git@gitlab.com:abc/llm.git
    - src: git@github.com:dmx/chat.git
      dst: git@gitlab.com:dmx/chat.git
```

### 字段说明

#### `backup_local`

* `interval_days`：定期备份间隔天数
* `save_dir`：本地保存目录
* `repos`：需要本地备份的仓库列表（仅支持 SSH 地址）

#### `backup_remote`

* `pairs`：源地址 → 目标地址 的备份对列表（完整镜像推送）

---

## 五、使用方法

### 1. 安装/构建

#### 📦 编译构建（支持 Go / Rust / Python 三种语言实现，以下以 Go 为例）

```bash
go build -o reposyncer main.go
```

#### ✅ 获取预编译版本

使用 GitHub Release 中的二进制执行文件，支持：

* `reposyncer-linux-amd64`
* `reposyncer-macos-arm64`
* `reposyncer-windows.exe`

---

### 2. 准备 SSH 密钥

确保已经为本地机器配置好 SSH 私钥，并加入到 `ssh-agent`，或在 `~/.ssh/config` 中配置对应主机名：

```bash
Host github.com
  User git
  IdentityFile ~/.ssh/id_rsa

Host gitlab.com
  User git
  IdentityFile ~/.ssh/id_rsa_gitlab
```

---

### 3. 启动备份任务

```bash
./reposyncer -config ./config.yaml
```

程序会根据配置文件自动定时进行备份。

---

## 六、核心实现逻辑

### 1. 本地备份流程

```bash
git clone --mirror git@github.com:abc/llm.git /home/tsai/data/abc/llm
cd /home/tsai/data/abc/llm
git remote update --prune
git submodule update --init --recursive
```

若已存在仓库，则执行：

```bash
cd /home/tsai/data/abc/llm
git remote update --prune
git fetch --all
git submodule update --init --recursive
```

### 2. 远程仓库同步流程

```bash
git clone --mirror git@github.com:abc/llm.git tmp_repo
cd tmp_repo
git remote add target git@gitlab.com:abc/llm.git
git push --mirror target
```

---

## 七、CI/CD 支持

### GitHub Actions 构建脚本（.github/workflows/build.yml）

```yaml
name: Build RepoSyncer

on:
  push:
    tags:
      - "v*"

jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v3
      - name: Set up Go
        uses: actions/setup-go@v4
        with:
          go-version: '1.21'

      - name: Build binary
        run: |
          GOOS=$(echo "${{ matrix.os }}" | cut -d '-' -f 1)
          GOARCH=amd64
          go build -o reposyncer-${GOOS}-${GOARCH} main.go

      - uses: actions/upload-artifact@v3
        with:
          name: reposyncer-${{ matrix.os }}
          path: reposyncer-*
```

---

## 八、未来计划

* [ ] 支持 HTTPS 凭证方式的仓库（当前仅支持 SSH）
* [ ] 支持增量备份，仅拉取 diff
* [ ] 增加 Web UI 配置和运行状态面板
* [ ] 日志系统和备份失败报警机制
* [ ] 支持 cron 表达式自定义定时规则

---

## 九、注意事项

* 本项目依赖系统中已安装的 `git` 命令
* 所有仓库地址必须是 SSH 地址
* 本地路径中账户名是从仓库地址解析出来的 `<user>/<repo>` 格式
* 如果远程仓库过大，建议首次手动备份

