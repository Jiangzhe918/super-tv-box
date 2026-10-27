# 超级影视 · Fongmi 单仓接口（免 jar）

一个 **单仓** JSON 接口配置 + 一个 **自建网盘搜索服务**。全部站点使用 `type: 1` 标准 CMS 采集协议，
因此 **不需要任何 jar 爬虫包**（配置里没有 `spider` 字段也能正常搜索与播放）。

```
在线影视：7 家采集源，实测 vod_play_from 里带 xxxm3u8 直连线路，
          返回真实 #EXTM3U，无需第三方解析即可播放。
网盘搜索：server/pan-search.js 把 pansou + panhub 的结果转换成 CMS 协议，
          Fongmi 用内置网盘播放器打开（ali / quark / baidu / 115 / uc / 迅雷 / 天翼 / 移动 / PikPak / 123 / 磁力）。
```

## 接口地址

```
https://gcore.jsdelivr.net/gh/Jiangzhe918/super-tv-box@main/config.json
```

备用（同一份文件的不同 CDN 节点）：

```
https://fastly.jsdelivr.net/gh/Jiangzhe918/super-tv-box@main/config.json
https://raw.githubusercontent.com/Jiangzhe918/super-tv-box/main/config.json
```

> jsdelivr 有缓存，`raw.githubusercontent.com` 在国内多数网络不可达，因此把 gcore 节点作为首选。
> 刚推送新版本后若仍读到旧内容，可用 `https://purge.jsdelivr.net/gh/Jiangzhe918/super-tv-box@main/config.json` 主动刷新。

粘贴到 Fongmi → 设置 → 配置地址 即可。**在线影视部分开箱即用**；
网盘搜索需要先跑起本仓库的服务（见下一节），未启动时该站点只是没有结果，不影响其它源。

## 开启网盘搜索

服务默认借用 pansou 公共演示实例与 panhub 公共精选库，**零配置也能出结果**，
但自建 pansou 后速度和链路完整性明显更好。

### 方式一：Docker（推荐）

```bash
git clone https://github.com/Jiangzhe918/super-tv-box.git
cd super-tv-box
docker compose up -d
```

启动后包含两个容器：`pansou`（8888）与 `pan-search`（8889）。

### 方式二：直接运行（需要 Node 18+）

```bash
node server/pan-search.js
```

### 让 Fongmi 拿到正确的地址

服务自带一个会**自动改写网盘站点地址**的配置入口。假设你的电脑内网 IP 是 `192.168.1.20`：

```
http://192.168.1.20:8889/config.json
```

用这个地址替换掉上面的 GitHub 地址，网盘搜索源会自动指向 `192.168.1.20:8889`，不用手改 `config.json`。
（只想改本地文件的话，把 `config.json` 里 `PanSearch` 的 `api` 中的 `127.0.0.1` 换成内网 IP 也一样。）

电视和电脑必须在同一局域网；Fongmi 还需在「设置 → 点播」里填对应网盘的 Cookie 才能直连播放。

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `8080` | 监听端口；`Dockerfile`/compose 里用 `8889` |
| `PANSOU_URL` | 空 | 自建 pansou 地址，如 `http://127.0.0.1:8888` |
| `PANSOU_TOKEN` | 空 | pansou 开启鉴权时的 token，只走环境变量，别提交进仓库 |
| `USE_PUBLIC_PANSOU` | `1` | 未配置自建时借用公共演示实例 |
| `PANHUB_URL` | 空 | 自建 panhub（Nitro）地址 |
| `USE_PUBLIC_PANHUB` | `1` | 使用 panhub 公共精选库 |
| `SEARCH_TIMEOUT` | `25000` | 单个上游超时（毫秒） |
| `CACHE_TTL` | `300` | 搜索结果缓存秒数 |

## 接口自检

```bash
curl "http://127.0.0.1:8889/health"
curl "http://127.0.0.1:8889/api.php/provide/vod/?ac=list"
curl "http://127.0.0.1:8889/api.php/provide/vod/?ac=videolist&wd=流浪地球"
```

实测输出（2026-10-27）：`流浪地球` 返回 40 张卡片、`quark/ali/baidu/115/thunder/uc/123/天翼/移动/磁力` 线路齐全，
`vod_play_from` 与 `vod_play_url` 的 `$$$` 段数一一对应，约 5 秒返回。

分类可用作筛选：`?ac=videolist&t=quark` 只返回夸克链路。

## 项目结构

```
├── config.json            # 单仓接口配置（type:1，无 spider 字段）
├── server/pan-search.js   # pansou + panhub -> CMS 协议聚合服务（零依赖）
├── Dockerfile             # pan-search 服务镜像
├── docker-compose.yml     # pansou + pan-search 一键部署
└── README.md
```

## 站点清单与验证状态

| 站点 | key | 接口 | 2026-10-27 实测 |
|------|-----|------|------------------|
| 🔍 网盘聚合搜索 | `PanSearch` | 自建 `:8889` | 40 条结果，10 类网盘，含海报 |
| 🎬 量子资源 | `LZCJ` | `cj.lziapi.com` | `ac=list` 200／40 分类；`lzm3u8` 直连 `#EXTM3U` ✅ |
| 🎬 非凡资源 | `FFCJ` | `cj.ffzyapi.com` | 31 分类；`ffm3u8` 直连 ✅ |
| 🎬 光速资源 | `GSCJ` | `api.guangsuapi.com` | 44 分类；`gsm3u8` 直连 ✅ |
| 🎬 金鹰资源 | `JYCJ` | `jyzyapi.com` | 44 分类；`jinyingm3u8` 直连 ✅ |
| 🎬 极速资源 | `JSCJ` | `jszyapi.com` | 48 分类；`jsm3u8` 直连 ✅ |
| 🎬 百度资源 | `BDCJ` | `api.apibdzy.com` | 54 分类；`dbm3u8` 本次请求超时，需重试 |
| 🎬 最大资源 | `ZDCJ` | `www.zuidazy.com` | 59 分类；`zuidam3u8` 本次搜索抖动 |

采集站点由社区运营，可用性会漂移；配置里保留 7 家互为冗余。

## 关于视频解析（`parses` 为什么是空的）

`config.json` 的 `parses` 故意留空，原因有两个：

1. **不需要**——上面 5 家源的 `xxxm3u8` 线路直接吐 `#EXTM3U`，套第三方解析反而更容易失败。
2. **验不过就不写**——常见社区解析是 `http://<裸IP>:7777/api/?key=xxxx&url=`。这类地址在本环境无法连通，
   而且 `key` 是别人发布的访问凭据，抄进公开仓库并不合适。

需要额外解析时，把自己的地址按下面格式填进 `parses` 即可（社区维护的完整解析列表请从你自己的可信源获取）：

```json
{ "name": "我的解析", "type": 1, "url": "https://你的解析地址/api/?key=你的key&url=", "ext": { "flag": ["liangzi", "feifan", "gsyun"] } }
```

不写解析时，Fongmi 仍会走 `rules` 里的嗅探规则（本项目沿用了社区成熟配置的 9 条嗅探/点击规则、5 条 DoH 与广告过滤，均已随配置一起提供）。

## 自定义

新增在线源：

```json
{
  "key": "新源key",
  "name": "🎬 新源名称",
  "type": 1,
  "api": "https://xxx/api.php/provide/vod/",
  "searchable": 1,
  "quickSearch": 1,
  "filterable": 0,
  "changeable": 0
}
```

`type` 语义：`0` = XML 采集，`1` = JSON 采集，`3` = 爬虫（需要 jar，本配置刻意不用）。

## 注意

- 本仓库是**公开**仓库：网盘 Cookie、pansou token 等一律放环境变量或 Fongmi 设置，不要提交。
- 仅供学习交流，请勿用于任何商业用途。

## 致谢

- [FongMi/TV](https://github.com/FongMi/TV)
- [PanSou](https://github.com/fish2018/pansou) — 网盘链接聚合引擎
- [PanHub](https://github.com/wu529778790/panhub.shenzjd.com) — 网盘资源精选与聚合
- 肥猫、饭太硬、王二小、老刘备、小马等社区源的制作者（本配置的 `rules`/`doh`/`ads` 借鉴自其公开配置结构）

## License

MIT
