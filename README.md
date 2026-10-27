# 超级影视聚合接口

> 集成网盘搜索(PanSou + PanHub) + 多家优质在线影视源 + 视频解析能力

## 项目简介

本项目是一个为 Fongmi/TVBox 影视软件设计的聚合接口配置，整合了以下能力：

- **网盘资源搜索**：集成 PanSou 和 PanHub，支持阿里云盘、夸克网盘、百度网盘、天翼网盘等多种网盘资源搜索
- **在线影视聚合**：整合饭太硬、肥猫、王二小、老刘备、小马等优质源的在线影视接口
- **视频解析**：内置多个视频解析接口，自动选择最佳解析线路
- **直播源**：内置央视、卫视等直播频道

## 接口地址

### 主接口（推荐）
```
https://raw.githubusercontent.com/Jiangzhe918/super-tv-box/main/config.json
```

### 多仓聚合接口
```
https://raw.githubusercontent.com/Jiangzhe918/super-tv-box/main/multi.json
```

### CDN加速地址（国内访问更快）
```
https://fastly.jsdelivr.net/gh/Jiangzhe918/super-tv-box@main/config.json
https://cdn.jsdelivr.net/gh/Jiangzhe918/super-tv-box@main/multi.json
```

## 使用方法

### 1. Fongmi / OK影视
1. 打开 Fongmi/OK影视 应用
2. 进入 **设置** → **配置接口**
3. 输入上述接口地址
4. 确认加载即可

### 2. TVBox
1. 打开 TVBox 应用
2. 进入 **设置** → **配置接口**
3. 粘贴接口地址
4. 点击确定

### 3. 影视仓
1. 打开影视仓
2. 设置 → 接口配置
3. 输入接口地址

## 项目结构

```
├── config.json              # 主配置文件（单仓）
├── multi.json               # 多仓聚合配置
├── spiders/                 # 爬虫脚本目录
│   ├── pan_search.js        # 网盘搜索爬虫（PanSou + PanHub）
│   ├── ali_pan.js           # 阿里云盘专用爬虫
│   ├── quark_pan.js         # 夸克网盘专用爬虫
│   ├── online_video.js      # 在线影视聚合爬虫
│   └── parser.js            # 视频解析聚合模块
├── server/                  # 后端服务（可选部署）
│   ├── pan_search_server.py # 网盘搜索API服务
│   └── requirements.txt     # Python依赖
├── Dockerfile               # Docker部署文件
└── README.md                # 项目说明
```

## 功能详情

### 网盘搜索
| 网盘类型 | 支持搜索 | 支持播放 |
|---------|---------|---------|
| 阿里云盘 | ✅ | ✅ |
| 夸克网盘 | ✅ | ✅ |
| 百度网盘 | ✅ | ✅ |
| 天翼网盘 | ✅ | ✅ |
| 115网盘 | ✅ | ✅ |
| 迅雷网盘 | ✅ | ✅ |
| UC网盘 | ✅ | ✅ |
| PikPak | ✅ | ✅ |

### 在线影视源
| 源名称 | 类型 | 状态 |
|--------|------|------|
| 饭太硬 | 在线 | ✅ |
| 肥猫 | 在线 | ✅ |
| 王二小 | 在线 | ✅ |
| 老刘备 | 在线 | ✅ |
| 小马(小米) | 在线 | ✅ |
| 高清影视(iiov) | 在线 | ✅ |
| 红牛资源 | 在线 | ✅ |
| 光速资源 | 在线 | ✅ |
| OK资源 | 在线 | ✅ |
| 极速资源 | 在线 | ✅ |
| 量子资源 | 在线 | ✅ |
| 非凡资源 | 在线 | ✅ |

### 视频解析接口
| 解析名称 | 支持平台 |
|---------|---------|
| 虾米解析 | QQ/爱奇艺/优酷/芒果/搜狐/乐视/B站 |
| 夜幕解析 | QQ/爱奇艺/优酷/芒果 |
| BL解析 | QQ/爱奇艺/优酷/芒果/搜狐 |
| 魔汤解析 | QQ/爱奇艺/优酷 |
| 极速解析 | QQ/爱奇艺/优酷/芒果/搜狐 |
| OK解析 | QQ/爱奇艺/优酷/芒果 |
| 爱豆解析 | QQ/爱奇艺/优酷 |

## 自建后端搜索服务（可选）

如果你想部署自己的网盘搜索后端服务：

### 方式一：直接运行
```bash
cd server
pip install -r requirements.txt
python pan_search_server.py
```

### 方式二：Docker部署
```bash
docker build -t pan-search-api .
docker run -d -p 8888:8888 --name pan-search pan-search-api
```

### API接口
- `GET /api/search?wd=关键词&page=1&type=ali` - 搜索网盘资源
- `GET /api/hot?limit=20` - 获取热门资源
- `GET /api/detail?id=资源ID` - 获取资源详情
- `GET /api/sources` - 获取支持的搜索源
- `GET /api.php/provide/vod/?wd=关键词` - TVBox兼容接口

## 配置说明

### 配置文件格式
本项目遵循 Fongmi/TVBox 的 JSON 配置规范：

```json
{
  "key": "接口唯一标识",
  "name": "接口显示名称",
  "spider": "爬虫JAR包地址",
  "sites": [],     // 站点列表
  "parses": [],    // 解析接口列表
  "lives": [],     // 直播源列表
  "flags": [],     // 播放器标志
  "ads": []        // 广告过滤规则
}
```

### 站点类型说明
| Type | 说明 |
|------|------|
| 0 | JSON API采集源（CMS站） |
| 1 | XML/采集接口源 |
| 3 | Spider爬虫源（JS/Java/Python） |
| 4 | 直链源 |

## 自定义配置

### 添加新的在线源
在 `config.json` 的 `sites` 数组中添加：
```json
{
  "key": "新源唯一key",
  "name": "🎬 新源名称",
  "type": 1,
  "api": "https://新源地址/api.php/provide/vod/",
  "searchable": 1,
  "quickSearch": 1,
  "filterable": 1,
  "changeable": 1
}
```

### 添加新的解析接口
在 `config.json` 的 `parses` 数组中添加：
```json
{
  "name": "新解析名称",
  "type": 0,
  "url": "https://新解析地址/?url="
}
```

## 注意事项

1. 所有第三方接口由社区维护，不保证长期可用
2. 建议配置多仓接口，主接口失效时可自动切换
3. 网盘资源需要对应的网盘账号才能播放
4. 本项目仅供学习交流使用

## 致谢

- [FongMi/TV](https://github.com/FongMi/TV) - FongMi影视开源项目
- [PanSou](https://github.com/fish2018/pansou) - 网盘搜索引擎
- [PanHub](https://github.com/wu529778790/panhub.shenzjd.com) - 网盘聚合搜索
- 饭太硬、肥猫、王二小、老刘备、小马等源的制作者们

## License

MIT License
