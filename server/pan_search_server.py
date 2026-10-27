"""
网盘资源搜索聚合后端 - 集成PanSou & PanHub
提供RESTful API供Fongmi/TVBox爬虫调用

部署方式:
1. pip install flask requests
2. python pan_search_server.py
3. 默认监听 0.0.0.0:8888

可选: 使用Docker部署
docker build -t pan-search-api .
docker run -p 8888:8888 pan-search-api
"""

from flask import Flask, jsonify, request
import requests
import json
import hashlib
import time
import re
from urllib.parse import quote, unquote
from concurrent.futures import ThreadPoolExecutor, as_completed

app = Flask(__name__)

# 缓存配置
CACHE = {}
CACHE_TTL = 300  # 5分钟缓存

# 线程池
executor = ThreadPoolExecutor(max_workers=10)

# ============================================================
# PanSou 搜索源配置
# ============================================================
PAN_SOU_SOURCES = [
    {
        'name': 'TG频道搜索',
        'url': 'https://api.pansou.v1/search',
        'method': 'GET',
        'enabled': True,
    },
    {
        'name': '网盘索引搜索',
        'url': 'https://api.pansou.v1/index',
        'method': 'GET',
        'enabled': True,
    },
]

# ============================================================
# PanHub 搜索源配置
# ============================================================
PAN_HUB_SOURCES = [
    {
        'name': 'PanHub聚合搜索',
        'url': 'https://panhub.shenzjd.com/api/search',
        'method': 'GET',
        'enabled': True,
    },
]

# ============================================================
# 第三方网盘搜索API（公开可用的聚合搜索接口）
# ============================================================
THIRD_PARTY_APIS = [
    {
        'name': '易搜',
        'url': 'https://yiso.fun/api/search',
        'method': 'GET',
        'params': {'name': '{keyword}', 'pageNo': '{page}'},
        'enabled': True,
    },
    {
        'name': '56搜索',
        'url': 'https://www.56wangpan.com/search',
        'method': 'GET',
        'params': {'kw': '{keyword}', 'page': '{page}'},
        'enabled': True,
    },
    {
        'name': '猫狸搜索',
        'url': 'https://www.alipansou.com/search',
        'method': 'GET',
        'params': {'k': '{keyword}', 'page': '{page}'},
        'enabled': True,
    },
    {
        'name': ' UP云搜',
        'url': 'https://www.upyunso3.com/search',
        'method': 'GET',
        'params': {'keyword': '{keyword}', 'page': '{page}'},
        'enabled': True,
    },
    {
        'name': '找资源',
        'url': 'https://www.zhaoziyuan.me/search',
        'method': 'GET',
        'params': {'q': '{keyword}', 'page': '{page}'},
        'enabled': True,
    },
]

# 网盘类型识别
PAN_TYPE_PATTERNS = {
    'ali': {
        'name': '阿里云盘',
        'icon': '💾',
        'patterns': ['alipan.com', 'aliyundrive.com', 'aliyun.com', 'alipansou'],
    },
    'quark': {
        'name': '夸克网盘',
        'icon': '⚡',
        'patterns': ['pan.quark.cn', 'quark.cn'],
    },
    'baidu': {
        'name': '百度网盘',
        'icon': '☁️',
        'patterns': ['pan.baidu.com', 'baidu.com'],
    },
    'tianyi': {
        'name': '天翼网盘',
        'icon': '🌤️',
        'patterns': ['cloud.189.cn', 'tianyi'],
    },
    '115': {
        'name': '115网盘',
        'icon': '🔢',
        'patterns': ['115.com'],
    },
    'thunder': {
        'name': '迅雷网盘',
        'icon': '⬇️',
        'patterns': ['thunder', 'xunlei'],
    },
    'uc': {
        'name': 'UC网盘',
        'icon': '📱',
        'patterns': ['uc.cn'],
    },
    'pikpak': {
        'name': 'PikPak',
        'icon': '📦',
        'patterns': ['pikpak'],
    },
}


def get_cache_key(*args):
    """生成缓存键"""
    raw = '|'.join(str(a) for a in args)
    return hashlib.md5(raw.encode()).hexdigest()


def cache_get(key):
    """获取缓存"""
    if key in CACHE:
        data, ts = CACHE[key]
        if time.time() - ts < CACHE_TTL:
            return data
        del CACHE[key]
    return None


def cache_set(key, data):
    """设置缓存"""
    CACHE[key] = (data, time.time())


def detect_pan_type(url):
    """检测网盘类型"""
    if not url:
        return 'unknown'
    url_lower = url.lower()
    for pan_id, info in PAN_TYPE_PATTERNS.items():
        for pattern in info['patterns']:
            if pattern in url_lower:
                return pan_id
    return 'unknown'


def format_pan_tag(pan_type):
    """格式化网盘标签"""
    if pan_type in PAN_TYPE_PATTERNS:
        info = PAN_TYPE_PATTERNS[pan_type]
        return info['icon'] + info['name']
    return '📁网盘'


def search_third_party(keyword, page=1):
    """从第三方API搜索"""
    results = []
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html, */*',
        'Referer': 'https://www.google.com/',
    }

    for api in THIRD_PARTY_APIS:
        if not api['enabled']:
            continue
        try:
            url = api['url']
            params = {}
            for k, v in api['params'].items():
                params[k] = v.replace('{keyword}', keyword).replace('{page}', str(page))

            resp = requests.get(url, params=params, headers=headers, timeout=10)
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    items = data.get('data', data.get('list', data.get('items', [])))
                    if isinstance(items, list):
                        for item in items:
                            title = item.get('title', item.get('name', ''))
                            link = item.get('url', item.get('link', item.get('share_url', '')))
                            if title and link:
                                pan_type = detect_pan_type(link)
                                results.append({
                                    'title': title,
                                    'url': link,
                                    'pan_type': pan_type,
                                    'pan_tag': format_pan_tag(pan_type),
                                    'source': api['name'],
                                    'size': item.get('size', ''),
                                    'time': item.get('time', item.get('created_at', item.get('date', ''))),
                                    'image': item.get('image', item.get('pic', item.get('icon', ''))),
                                })
                except (json.JSONDecodeError, ValueError):
                    pass
        except Exception:
            continue

    return results


def search_pansou(keyword, page=1):
    """从PanSou搜索"""
    results = []
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
    try:
        url = f'https://api.pansou.v1/search?q={quote(keyword)}&page={page}'
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get('data', data.get('list', []))
            for item in items:
                title = item.get('title', item.get('name', ''))
                link = item.get('url', item.get('link', ''))
                if title and link:
                    pan_type = detect_pan_type(link)
                    results.append({
                        'title': title,
                        'url': link,
                        'pan_type': pan_type,
                        'pan_tag': format_pan_tag(pan_type),
                        'source': 'PanSou',
                        'size': item.get('size', ''),
                        'time': item.get('time', item.get('date', '')),
                        'image': item.get('image', item.get('pic', '')),
                    })
    except Exception:
        pass
    return results


def search_panhub(keyword, page=1):
    """从PanHub搜索"""
    results = []
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
    try:
        url = f'https://panhub.shenzjd.com/api/search?q={quote(keyword)}&page={page}'
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            items = data.get('data', data.get('list', []))
            for item in items:
                title = item.get('title', item.get('name', ''))
                link = item.get('url', item.get('link', ''))
                if title and link:
                    pan_type = detect_pan_type(link)
                    results.append({
                        'title': title,
                        'url': link,
                        'pan_type': pan_type,
                        'pan_tag': format_pan_tag(pan_type),
                        'source': 'PanHub',
                        'size': item.get('size', ''),
                        'time': item.get('time', item.get('date', '')),
                        'image': item.get('image', item.get('pic', '')),
                    })
    except Exception:
        pass
    return results


def deduplicate_results(results):
    """去重并排序"""
    seen = set()
    unique = []
    for r in results:
        key = r.get('title', '') + r.get('url', '')
        if key and key not in seen:
            seen.add(key)
            unique.append(r)
    return unique


# ============================================================
# API路由
# ============================================================

@app.route('/')
def index():
    return jsonify({
        'name': '网盘资源搜索聚合API',
        'version': '1.0.0',
        'endpoints': {
            '/api/search': '搜索网盘资源 (GET: ?wd=关键词&page=页码&type=网盘类型)',
            '/api/hot': '获取热门资源 (GET: ?limit=数量)',
            '/api/detail': '获取资源详情 (GET: ?id=资源ID)',
            '/api/sources': '获取支持的搜索源列表',
        },
    })


@app.route('/api/search')
def api_search():
    keyword = request.args.get('wd', request.args.get('q', request.args.get('keyword', '')))
    page = int(request.args.get('page', 1))
    pan_type = request.args.get('type', '')

    if not keyword:
        return jsonify({'code': -1, 'msg': '请输入搜索关键词', 'data': []})

    cache_key = get_cache_key('search', keyword, page, pan_type)
    cached = cache_get(cache_key)
    if cached:
        return jsonify({'code': 0, 'msg': 'ok', 'data': cached})

    all_results = []

    # 并发搜索所有源
    futures = {
        executor.submit(search_pansou, keyword, page): 'pansou',
        executor.submit(search_panhub, keyword, page): 'panhub',
        executor.submit(search_third_party, keyword, page): 'third_party',
    }

    for future in as_completed(futures):
        try:
            results = future.result(timeout=15)
            all_results.extend(results)
        except Exception:
            continue

    # 去重
    all_results = deduplicate_results(all_results)

    # 按网盘类型过滤
    if pan_type and pan_type != 'all':
        all_results = [r for r in all_results if r.get('pan_type') == pan_type]

    cache_set(cache_key, all_results)

    return jsonify({
        'code': 0,
        'msg': 'ok',
        'data': all_results,
        'total': len(all_results),
        'page': page,
    })


@app.route('/api/hot')
def api_hot():
    limit = int(request.args.get('limit', 20))
    cache_key = get_cache_key('hot', limit)
    cached = cache_get(cache_key)
    if cached:
        return jsonify({'code': 0, 'msg': 'ok', 'data': cached})

    # 热门资源 - 使用热门搜索词
    hot_keywords = ['2024电影', '热门电视剧', '4K', '综艺', '动漫']
    all_results = []

    for kw in hot_keywords:
        results = search_third_party(kw, 1)
        all_results.extend(results)
        if len(all_results) >= limit:
            break

    all_results = deduplicate_results(all_results)[:limit]
    cache_set(cache_key, all_results)

    return jsonify({'code': 0, 'msg': 'ok', 'data': all_results})


@app.route('/api/detail')
def api_detail():
    resource_id = request.args.get('id', '')
    if not resource_id:
        return jsonify({'code': -1, 'msg': '缺少资源ID'})

    return jsonify({
        'code': 0,
        'msg': 'ok',
        'data': {
            'id': resource_id,
            'title': '资源详情',
            'url': resource_id if resource_id.startswith('http') else '',
            'description': '请点击播放按钮访问网盘资源',
        },
    })


@app.route('/api/sources')
def api_sources():
    sources = []
    sources.append({'name': 'PanSou', 'status': 'active', 'description': 'PanSou网盘搜索引擎'})
    sources.append({'name': 'PanHub', 'status': 'active', 'description': 'PanHub聚合搜索'})
    for api in THIRD_PARTY_APIS:
        sources.append({
            'name': api['name'],
            'status': 'active' if api['enabled'] else 'disabled',
            'description': f'{api["name"]}搜索接口',
        })
    return jsonify({'code': 0, 'data': sources})


# TVBox/Fongmi 兼容接口
@app.route('/api.php/provide/vod/')
def tvbox_vod():
    """兼容TVBox CMS API格式"""
    action = request.args.get('ac', 'list')
    keyword = request.args.get('wd', '')
    page = int(request.args.get('pg', 1))
    type_id = request.args.get('t', '')

    if keyword:
        # 搜索模式
        search_result = api_search.__wrapped__() if hasattr(api_search, '__wrapped__') else None
        with app.test_request_context(f'/api/search?wd={quote(keyword)}&page={page}'):
            resp = api_search()
            data = resp.get_json()

        vod_list = []
        if data.get('code') == 0:
            for i, item in enumerate(data.get('data', [])):
                vod_list.append({
                    'vod_id': str(i + 1),
                    'vod_name': item.get('title', ''),
                    'vod_pic': item.get('image', ''),
                    'vod_remarks': item.get('pan_tag', '') + ' ' + item.get('source', ''),
                    'vod_content': item.get('title', ''),
                    'vod_play_from': item.get('source', '网盘搜索'),
                    'vod_play_url': item.get('url', ''),
                })

        return jsonify({
            'code': 1,
            'page': page,
            'pagecount': 10,
            'limit': 20,
            'total': len(vod_list),
            'list': vod_list,
        })

    # 列表模式
    return jsonify({
        'code': 1,
        'page': page,
        'pagecount': 10,
        'limit': 20,
        'total': 0,
        'list': [],
    })


if __name__ == '__main__':
    print('=' * 60)
    print('  网盘资源搜索聚合API v1.0')
    print('  集成: PanSou + PanHub + 多源聚合搜索')
    print('  监听: http://0.0.0.0:8888')
    print('  TVBox接口: http://YOUR_IP:8888/api.php/provide/vod/')
    print('=' * 60)
    app.run(host='0.0.0.0', port=8888, debug=False)
