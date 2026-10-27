// ============================================================
// 阿里云盘专用爬虫
// 适配 Fongmi/TVBox Spider JS 引擎
// ============================================================

var rule = {
    title: '阿里云盘',
    host: 'https://www.alipan.com',
    homeUrl: '/api/v2/recommend',
    url: '/api/v2/search?kw=fypage&sort=updated&page=fypage',
    searchUrl: '/api/v2/search?kw=**&sort=updated&page=fypage',
    searchable: 2,
    quickSearch: 0,
    filterable: 0,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.alipan.com/',
    },
    class_name: '电影&电视剧&综艺&动漫&纪录片&4K',
    class_url: 'movie&tv&variety&anime&documentary&4k',
    play_parse: true,
    lazy: '',
    一级: 'json:data;name;size;icon;url',
    二级: {
        title: 'data.name',
        img: 'data.icon',
        desc: 'data.size',
        content: 'data.description',
        tabs: 'data.tabs',
        lists: 'data.lists',
    },
    搜索: 'json:data;*;*;*;*',
};

// 阿里云盘搜索API（使用聚合搜索）
var ALI_SEARCH_APIS = [
    'https://api.aliyunpan.example.com/v1/search',
    'https://alipan.ddo.jp/api/search',
    'https://pan.363m.com/api/ali',
];

var CATEGORY_MAP = {
    'movie': ['电影', 'movie', 'film'],
    'tv': ['电视剧', '电视', '连续剧', 'tv', 'drama'],
    'variety': ['综艺', 'variety', 'show'],
    'anime': ['动漫', '动画', 'anime'],
    'documentary': ['纪录片', 'documentary', 'doc'],
    '4k': ['4K', '4k', '超高清', 'UHD'],
};

function init(ext) {
    if (ext) {
        try {
            var config = typeof ext === 'string' ? JSON.parse(ext) : ext;
            if (config.token) {
                rule.headers['Authorization'] = 'Bearer ' + config.token;
            }
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
    return JSON.stringify({ class: classes });
}

function homeVod() {
    var videos = [];
    try {
        var apiUrl = ALI_SEARCH_APIS[0] + '?action=hot&limit=20';
        var html = fetch(apiUrl, {
            headers: rule.headers,
            method: 'GET'
        });
        var json = JSON.parse(html);
        if (json && json.data) {
            var items = json.data.items || json.data.list || json.data;
            for (var i = 0; i < Math.min(items.length, 20); i++) {
                var item = items[i];
                videos.push({
                    vod_id: item.id || item.share_id || ('ali_hot_' + i),
                    vod_name: item.title || item.name || '未知资源',
                    vod_pic: item.image || item.icon || item.thumb || '',
                    vod_remarks: '💾阿里 ' + (item.size || '') + ' ' + (item.updated_at || item.time || ''),
                });
            }
        }
    } catch (e) {}
    return JSON.stringify({ list: videos });
}

function category(tid, pg, filter, extend) {
    if (pg <= 0) pg = 1;
    var videos = [];
    try {
        var keywords = CATEGORY_MAP[tid] || [tid];
        var searchKw = keywords[0];
        var apiUrl = ALI_SEARCH_APIS[0] + '?action=search&kw=' + encodeURIComponent(searchKw) + '&page=' + pg + '&type=ali';
        var html = fetch(apiUrl, {
            headers: rule.headers,
            method: 'GET'
        });
        var json = JSON.parse(html);
        if (json && json.data) {
            var items = json.data.items || json.data.list || json.data;
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var title = item.title || item.name || '';
                // 过滤：确保是阿里云盘资源
                var url = item.url || item.link || '';
                if (url.indexOf('ali') > -1 || url.indexOf('alipan') > -1 || (item.type && item.type.indexOf('ali') > -1)) {
                    videos.push({
                        vod_id: item.id || item.share_id || ('ali_' + tid + '_' + i),
                        vod_name: title,
                        vod_pic: item.image || item.icon || item.thumb || '',
                        vod_remarks: '💾 ' + (item.size || '') + ' ' + (item.updated_at || item.time || ''),
                    });
                }
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
        var apiUrl = ALI_SEARCH_APIS[0] + '?action=detail&id=' + id;
        var html = fetch(apiUrl, {
            headers: rule.headers,
            method: 'GET'
        });
        var json = JSON.parse(html);
        if (json && json.data) {
            var item = json.data;
            vod = {
                vod_id: id,
                vod_name: item.title || item.name || '未知资源',
                vod_pic: item.image || item.icon || '',
                vod_desc: item.description || item.desc || '',
                vod_content: item.content || item.detail || item.description || '',
                vod_play_from: '阿里云盘',
                vod_play_url: item.url || item.share_url || item.link || '',
            };
        }
    } catch (e) {}
    return JSON.stringify({ list: [vod] });
}

function play(flag, id, flags) {
    var url = id;
    // 阿里云盘链接需要解析
    if (url.indexOf('alipan.com') > -1 || url.indexOf('aliyundrive.com') > -1) {
        // 提取分享ID
        var shareId = extractShareId(url);
        if (shareId) {
            return JSON.stringify({
                parse: 1,
                jx: 1,
                url: url,
                header: JSON.stringify(rule.headers),
            });
        }
    }
    return JSON.stringify({ parse: 1, jx: 1, url: url });
}

function search(wd, quick, pg) {
    if (pg <= 0) pg = 1;
    var videos = [];
    
    for (var a = 0; a < ALI_SEARCH_APIS.length; a++) {
        try {
            var apiUrl = ALI_SEARCH_APIS[a] + '?action=search&kw=' + encodeURIComponent(wd) + '&page=' + pg + '&type=ali';
            var html = fetch(apiUrl, {
                headers: rule.headers,
                method: 'GET'
            });
            var json = JSON.parse(html);
            if (json && json.data) {
                var items = json.data.items || json.data.list || json.data;
                for (var i = 0; i < items.length; i++) {
                    var item = items[i];
                    videos.push({
                        vod_id: item.id || item.share_id || ('ali_s_' + a + '_' + i),
                        vod_name: item.title || item.name || '未知资源',
                        vod_pic: item.image || item.icon || item.thumb || '',
                        vod_remarks: '💾阿里 ' + (item.size || '') + ' ' + (item.updated_at || item.time || ''),
                    });
                }
                if (videos.length > 0) break; // 有结果就停止尝试其他API
            }
        } catch (e) {}
    }
    
    return JSON.stringify({
        page: pg,
        pagecount: 10,
        limit: 20,
        total: videos.length,
        list: videos,
    });
}

function extractShareId(url) {
    var match = url.match(/\/s\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
}

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
