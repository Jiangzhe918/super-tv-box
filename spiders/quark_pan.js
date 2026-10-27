// ============================================================
// 夸克网盘专用爬虫
// 适配 Fongmi/TVBox Spider JS 引擎
// ============================================================

var rule = {
    title: '夸克网盘',
    host: 'https://pan.quark.cn',
    homeUrl: '/api/hot',
    url: '/api/search?kw=fypage&sort=updated&page=fypage',
    searchUrl: '/api/search?kw=**&sort=updated&page=fypage',
    searchable: 2,
    quickSearch: 0,
    filterable: 0,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://pan.quark.cn/',
    },
    class_name: '电影&电视剧&综艺&动漫&纪录片&短剧&4K',
    class_url: 'movie&tv&variety&anime&documentary&short&4k',
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

var QUARK_SEARCH_APIS = [
    'https://api.quarkpan.example.com/v1/search',
    'https://pan.363m.com/api/quark',
    'https://quark.ddo.jp/api/search',
];

var CATEGORY_MAP = {
    'movie': ['电影', 'movie', 'film'],
    'tv': ['电视剧', '电视', '连续剧', 'tv', 'drama'],
    'variety': ['综艺', 'variety', 'show'],
    'anime': ['动漫', '动画', 'anime'],
    'documentary': ['纪录片', 'documentary', 'doc'],
    'short': ['短剧', 'short', '微剧'],
    '4k': ['4K', '4k', '超高清', 'UHD'],
};

function init(ext) {
    if (ext) {
        try {
            var config = typeof ext === 'string' ? JSON.parse(ext) : ext;
            if (config.cookie) {
                rule.headers['Cookie'] = config.cookie;
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
        var apiUrl = QUARK_SEARCH_APIS[0] + '?action=hot&limit=20';
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
                    vod_id: item.id || item.share_id || ('quark_hot_' + i),
                    vod_name: item.title || item.name || '未知资源',
                    vod_pic: item.image || item.icon || item.thumb || '',
                    vod_remarks: '⚡夸克 ' + (item.size || '') + ' ' + (item.updated_at || item.time || ''),
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
        var apiUrl = QUARK_SEARCH_APIS[0] + '?action=search&kw=' + encodeURIComponent(searchKw) + '&page=' + pg + '&type=quark';
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
                    vod_id: item.id || item.share_id || ('quark_' + tid + '_' + i),
                    vod_name: item.title || item.name || '未知资源',
                    vod_pic: item.image || item.icon || item.thumb || '',
                    vod_remarks: '⚡夸克 ' + (item.size || '') + ' ' + (item.updated_at || item.time || ''),
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
        var apiUrl = QUARK_SEARCH_APIS[0] + '?action=detail&id=' + id;
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
                vod_play_from: '夸克网盘',
                vod_play_url: item.url || item.share_url || item.link || '',
            };
        }
    } catch (e) {}
    return JSON.stringify({ list: [vod] });
}

function play(flag, id, flags) {
    var url = id;
    if (url.indexOf('pan.quark.cn') > -1 || url.indexOf('quark.cn') > -1) {
        return JSON.stringify({
            parse: 1,
            jx: 1,
            url: url,
            header: JSON.stringify(rule.headers),
        });
    }
    return JSON.stringify({ parse: 1, jx: 1, url: url });
}

function search(wd, quick, pg) {
    if (pg <= 0) pg = 1;
    var videos = [];
    
    for (var a = 0; a < QUARK_SEARCH_APIS.length; a++) {
        try {
            var apiUrl = QUARK_SEARCH_APIS[a] + '?action=search&kw=' + encodeURIComponent(wd) + '&page=' + pg + '&type=quark';
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
                        vod_id: item.id || item.share_id || ('quark_s_' + a + '_' + i),
                        vod_name: item.title || item.name || '未知资源',
                        vod_pic: item.image || item.icon || item.thumb || '',
                        vod_remarks: '⚡夸克 ' + (item.size || '') + ' ' + (item.updated_at || item.time || ''),
                    });
                }
                if (videos.length > 0) break;
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
