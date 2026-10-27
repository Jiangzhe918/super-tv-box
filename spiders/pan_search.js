// ============================================================
// 网盘资源搜索爬虫 - 集成PanSou & PanHub搜索能力
// 适配 Fongmi/TVBox Spider JS 引擎
// ============================================================

var rule = {
    title: '网盘资源搜索',
    host: 'https://pan.example.com',
    homeUrl: '/api/search',
    url: '/api/search?wd=fypage&pg=fypage',
    searchUrl: '/api/search?wd=**&pg=fypage',
    searchable: 2,
    quickSearch: 0,
    filterable: 0,
    headers: {
        'User-Agent': 'PC_UA',
    },
    class_name: '阿里云盘&夸克网盘&百度网盘&天翼网盘&115网盘&迅雷网盘&UC网盘&PikPak',
    class_url: 'ali&quark&baidu&tianyi&115&thunder&uc&pikpak',
    play_parse: true,
    lazy: '',
    一级: 'json:data;name;desc;pic;url',
    二级: {
        title: 'data.name',
        img: 'data.pic',
        desc: 'data.desc',
        content: 'data.content',
        tabs: 'data.tabs',
        lists: 'data.lists',
    },
    搜索: 'json:data;*;*;*;*',
};

// PanSou API 配置
var PAN_SOU_API = 'https://pansou.api.example.com';
// PanHub API 配置
var PAN_HUB_API = 'https://panhub.api.example.com';

// 网盘类型映射
var PAN_TYPES = {
    'ali': { name: '阿里云盘', icon: '💾', id: 1 },
    'quark': { name: '夸克网盘', icon: '⚡', id: 2 },
    'baidu': { name: '百度网盘', icon: '☁️', id: 3 },
    'tianyi': { name: '天翼网盘', icon: '🌤️', id: 4 },
    '115': { name: '115网盘', icon: '🔢', id: 5 },
    'thunder': { name: '迅雷网盘', icon: '⬇️', id: 6 },
    'uc': { name: 'UC网盘', icon: '📱', id: 7 },
    'pikpak': { name: 'PikPak', icon: '📦', id: 8 },
};

function init(ext) {
    if (ext) {
        try {
            var config = typeof ext === 'string' ? JSON.parse(ext) : ext;
            if (config.panSouApi) PAN_SOU_API = config.panSouApi;
            if (config.panHubApi) PAN_HUB_API = config.panHubApi;
        } catch (e) {}
    }
}

function home(filter) {
    var classes = [];
    var classNames = rule.class_name.split('&');
    var classUrls = rule.class_url.split('&');
    for (var i = 0; i < classNames.length; i++) {
        classes.push({
            type_id: classUrls[i],
            type_name: classNames[i]
        });
    }
    var result = { class: classes };
    if (filter) {
        result.filters = {};
    }
    return JSON.stringify(result);
}

function homeVod() {
    // 首页推荐 - 返回最新热门网盘资源
    var videos = [];
    try {
        var html = fetch(PAN_SOU_API + '/api/hot', {
            headers: rule.headers,
            method: 'GET'
        });
        var json = JSON.parse(html);
        if (json && json.data) {
            for (var i = 0; i < Math.min(json.data.length, 20); i++) {
                var item = json.data[i];
                var panType = detectPanType(item.url || item.link || '');
                videos.push({
                    vod_id: item.id || (panType + '_' + i),
                    vod_name: item.title || item.name || '未知资源',
                    vod_pic: item.pic || item.image || '',
                    vod_remarks: formatPanTag(panType) + ' ' + (item.time || item.date || ''),
                });
            }
        }
    } catch (e) {
        // 首页推荐获取失败，返回空
    }
    return JSON.stringify({ list: videos });
}

function category(tid, pg, filter, extend) {
    if (pg <= 0) pg = 1;
    var videos = [];
    try {
        var panTypeId = PAN_TYPES[tid] ? PAN_TYPES[tid].id : 0;
        var apiUrl = PAN_SOU_API + '/api/search?type=' + panTypeId + '&page=' + pg;
        var html = fetch(apiUrl, {
            headers: rule.headers,
            method: 'GET'
        });
        var json = JSON.parse(html);
        if (json && json.data) {
            for (var i = 0; i < json.data.length; i++) {
                var item = json.data[i];
                videos.push({
                    vod_id: item.id || (tid + '_' + i),
                    vod_name: item.title || item.name || '未知资源',
                    vod_pic: item.pic || item.image || '',
                    vod_remarks: formatPanTag(tid) + ' ' + (item.size || '') + ' ' + (item.time || ''),
                });
            }
        }
    } catch (e) {}
    return JSON.stringify({
        page: pg,
        pagecount: 10,
        limit: 20,
        total: videos.length,
        list: videos,
    });
}

function detail(id) {
    var vod = {};
    try {
        // 先从PanSou获取详情
        var html = fetch(PAN_SOU_API + '/api/detail?id=' + id, {
            headers: rule.headers,
            method: 'GET'
        });
        var json = JSON.parse(html);
        if (json && json.data) {
            var item = json.data;
            vod = {
                vod_id: id,
                vod_name: item.title || item.name || '未知资源',
                vod_pic: item.pic || item.image || '',
                vod_desc: item.desc || item.description || '',
                vod_content: item.content || item.detail || '',
                vod_play_from: item.source || '网盘搜索',
                vod_play_url: item.url || item.link || '',
            };
        }
    } catch (e) {}

    // 尝试从PanHub获取补充信息
    try {
        var html2 = fetch(PAN_HUB_API + '/api/detail?id=' + id, {
            headers: rule.headers,
            method: 'GET'
        });
        var json2 = JSON.parse(html2);
        if (json2 && json2.data && !vod.vod_content) {
            vod.vod_content = json2.data.detail || json2.data.description || '';
        }
    } catch (e) {}

    return JSON.stringify({ list: [vod] });
}

function play(flag, id, flags) {
    // 网盘资源需要特殊处理播放链接
    var url = id;
    
    // 检测是否为网盘直链
    if (url.indexOf('alipan.com') > -1 || url.indexOf('aliyundrive.com') > -1) {
        return JSON.stringify({ parse: 1, jx: 1, url: url });
    }
    if (url.indexOf('pan.quark.cn') > -1) {
        return JSON.stringify({ parse: 1, jx: 1, url: url });
    }
    if (url.indexOf('pan.baidu.com') > -1) {
        return JSON.stringify({ parse: 1, jx: 1, url: url });
    }
    
    // 普通链接直接播放
    if (url.indexOf('.m3u8') > -1 || url.indexOf('.mp4') > -1 || url.indexOf('.mkv') > -1) {
        return JSON.stringify({ parse: 0, url: url });
    }
    
    // 需要解析的链接
    return JSON.stringify({ parse: 1, jx: 1, url: url });
}

function search(wd, quick, pg) {
    if (pg <= 0) pg = 1;
    var videos = [];
    
    // 同时从PanSou和PanHub搜索，合并结果
    var results = [];
    
    // PanSou搜索
    try {
        var html1 = fetch(PAN_SOU_API + '/api/search?wd=' + encodeURIComponent(wd) + '&page=' + pg, {
            headers: rule.headers,
            method: 'GET'
        });
        var json1 = JSON.parse(html1);
        if (json1 && json1.data) {
            for (var i = 0; i < json1.data.length; i++) {
                var item = json1.data[i];
                item._source = 'pansou';
                results.push(item);
            }
        }
    } catch (e) {}
    
    // PanHub搜索
    try {
        var html2 = fetch(PAN_HUB_API + '/api/search?wd=' + encodeURIComponent(wd) + '&page=' + pg, {
            headers: rule.headers,
            method: 'GET'
        });
        var json2 = JSON.parse(html2);
        if (json2 && json2.data) {
            for (var j = 0; j < json2.data.length; j++) {
                var item2 = json2.data[j];
                item2._source = 'panhub';
                results.push(item2);
            }
        }
    } catch (e) {}
    
    // 去重并排序
    var seen = {};
    for (var k = 0; k < results.length; k++) {
        var r = results[k];
        var key = r.title || r.name || '';
        if (key && !seen[key]) {
            seen[key] = true;
            var panType = detectPanType(r.url || r.link || '');
            videos.push({
                vod_id: r.id || ('search_' + k),
                vod_name: r.title || r.name || '未知资源',
                vod_pic: r.pic || r.image || '',
                vod_remarks: formatPanTag(panType) + ' ' + (r.source || '') + ' ' + (r.time || r.date || ''),
            });
        }
    }
    
    return JSON.stringify({
        page: pg,
        pagecount: 10,
        limit: 20,
        total: videos.length,
        list: videos,
    });
}

// 工具函数：检测网盘类型
function detectPanType(url) {
    if (!url) return 'unknown';
    url = url.toLowerCase();
    if (url.indexOf('alipan.com') > -1 || url.indexOf('aliyundrive.com') > -1 || url.indexOf('aliyun.com') > -1) return 'ali';
    if (url.indexOf('quark.cn') > -1 || url.indexOf('pan.quark') > -1) return 'quark';
    if (url.indexOf('pan.baidu.com') > -1 || url.indexOf('baidu.com') > -1) return 'baidu';
    if (url.indexOf('cloud.189.cn') > -1 || url.indexOf('tianyi') > -1) return 'tianyi';
    if (url.indexOf('115.com') > -1) return '115';
    if (url.indexOf('thunder') > -1 || url.indexOf('xunlei') > -1) return 'thunder';
    if (url.indexOf('uc.cn') > -1) return 'uc';
    if (url.indexOf('pikpak') > -1) return 'pikpak';
    return 'unknown';
}

// 工具函数：格式化网盘标签
function formatPanTag(type) {
    if (PAN_TYPES[type]) {
        return PAN_TYPES[type].icon + PAN_TYPES[type].name;
    }
    return '📁网盘';
}

// 导出函数
function __js__() {
    return {
        init: init,
        home: home,
        homeVod: homeVod,
        category: category,
        detail: detail,
        play: play,
        search: search,
        rule: rule,
    };
}
