// ============================================================
// 在线影视聚合爬虫 - 整合多家优质在线源
// 集成：肥猫、饭太硬、王二小、老刘备、小马等源的优质接口
// 适配 Fongmi/TVBox Spider JS 引擎
// ============================================================

var rule = {
    title: '在线影视聚合',
    host: 'https://online.example.com',
    homeUrl: '/api/recommend',
    url: '/api/vod?type=fyclass&page=fypage',
    searchUrl: '/api/search?wd=**&page=fypage',
    searchable: 2,
    quickSearch: 1,
    filterable: 1,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    class_name: '电影&电视剧&综艺&动漫&动作片&喜剧片&爱情片&科幻片&恐怖片&剧情片&战争片&国产剧&港台剧&日韩剧&欧美剧',
    class_url: '1&2&3&4&6&7&8&9&10&11&12&13&14&15&16',
    play_parse: true,
    lazy: '',
    一级: 'json:data;vod_name;vod_remarks;vod_pic;vod_id',
    二级: {
        title: 'data.vod_name',
        img: 'data.vod_pic',
        desc: 'data.vod_remarks',
        content: 'data.vod_content',
        tabs: 'data.vod_play_from',
        lists: 'data.vod_play_url',
    },
    搜索: 'json:data;vod_name;vod_remarks;vod_pic;vod_id',
};

// 聚合多个优质在线源API
var ONLINE_SOURCES = [
    {
        name: '饭太硬',
        api: 'http://www.饭太硬.com/api.php/provide/vod/',
        weight: 10,
        enabled: true,
    },
    {
        name: '肥猫',
        api: 'http://肥猫.com/api.php/provide/vod/',
        weight: 9,
        enabled: true,
    },
    {
        name: '王二小',
        api: 'http://tvbox.王二小放牛娃.top/api.php/provide/vod/',
        weight: 8,
        enabled: true,
    },
    {
        name: '老刘备',
        api: 'https://raw.liucn.cc/box/m.json',
        weight: 7,
        enabled: true,
    },
    {
        name: '小马',
        api: 'https://mitvbox.xyz/小米/DEMO.json',
        weight: 7,
        enabled: true,
    },
    {
        name: '高清影视',
        api: 'https://api.iiov.cn/api.php/provide/vod/',
        weight: 8,
        enabled: true,
    },
    {
        name: '红牛资源',
        api: 'https://www.hongniuzy2.com/api.php/provide/vod/',
        weight: 7,
        enabled: true,
    },
    {
        name: '光速资源',
        api: 'https://api.guangsuapi.com/api.php/provide/vod/',
        weight: 7,
        enabled: true,
    },
    {
        name: 'OK资源',
        api: 'https://api.okzyapi.com/api.php/provide/vod/',
        weight: 6,
        enabled: true,
    },
    {
        name: '极速资源',
        api: 'https://jszyapi.com/api.php/provide/vod/',
        weight: 6,
        enabled: true,
    },
];

// 视频解析接口列表
var PARSE_URLS = [
    'https://jx.xmflv.com/?url=',
    'https://www.yemu.xyz/?url=',
    'https://jx.blbo.cc/?url=',
    'https://www.mtosz.com/m3u8.php?url=',
    'https://api.jiexi.la/?url=',
    'https://jx.xmflv.cc/?url=',
    'https://www.yemu.xyz/?url=',
];

function init(ext) {
    if (ext) {
        try {
            var config = typeof ext === 'string' ? JSON.parse(ext) : ext;
            if (config.sources) {
                // 允许通过ext配置启用/禁用特定源
                for (var i = 0; i < config.sources.length; i++) {
                    var src = config.sources[i];
                    for (var j = 0; j < ONLINE_SOURCES.length; j++) {
                        if (ONLINE_SOURCES[j].name === src.name) {
                            ONLINE_SOURCES[j].enabled = src.enabled !== false;
                            if (src.api) ONLINE_SOURCES[j].api = src.api;
                        }
                    }
                }
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
    
    var result = { class: classes };
    
    if (filter) {
        result.filters = {
            '1': [{ key: 'area', name: '地区', value: [{ n: '全部', v: '' }, { n: '大陆', v: '大陆' }, { n: '香港', v: '香港' }, { n: '台湾', v: '台湾' }, { n: '美国', v: '美国' }, { n: '韩国', v: '韩国' }, { n: '日本', v: '日本' }] }],
            '2': [{ key: 'area', name: '地区', value: [{ n: '全部', v: '' }, { n: '大陆', v: '大陆' }, { n: '香港', v: '香港' }, { n: '台湾', v: '台湾' }, { n: '美国', v: '美国' }, { n: '韩国', v: '韩国' }, { n: '日本', v: '日本' }] }],
        };
    }
    
    return JSON.stringify(result);
}

function homeVod() {
    var videos = [];
    var seen = {};
    
    // 从多个源并发获取首页推荐
    for (var s = 0; s < ONLINE_SOURCES.length; s++) {
        if (!ONLINE_SOURCES[s].enabled) continue;
        try {
            var apiUrl = ONLINE_SOURCES[s].api + '?ac=detail&pg=1&limit=10';
            var html = fetch(apiUrl, {
                headers: rule.headers,
                method: 'GET'
            });
            var json = JSON.parse(html);
            if (json && json.list) {
                for (var i = 0; i < json.list.length; i++) {
                    var item = json.list[i];
                    var key = item.vod_name || '';
                    if (key && !seen[key]) {
                        seen[key] = true;
                        videos.push({
                            vod_id: item.vod_id || (ONLINE_SOURCES[s].name + '_' + i),
                            vod_name: item.vod_name || '未知',
                            vod_pic: item.vod_pic || '',
                            vod_remarks: '[' + ONLINE_SOURCES[s].name + '] ' + (item.vod_remarks || item.vod_state || ''),
                            source: ONLINE_SOURCES[s].name,
                        });
                    }
                }
            }
        } catch (e) {}
        if (videos.length >= 30) break;
    }
    
    return JSON.stringify({ list: videos.slice(0, 30) });
}

function category(tid, pg, filter, extend) {
    if (pg <= 0) pg = 1;
    var videos = [];
    var seen = {};
    
    // 按权重顺序尝试各个源
    var sortedSources = ONLINE_SOURCES.filter(function(s) { return s.enabled; }).sort(function(a, b) { return b.weight - a.weight; });
    
    for (var s = 0; s < sortedSources.length; s++) {
        try {
            var apiUrl = sortedSources[s].api + '?ac=detail&t=' + tid + '&pg=' + pg + '&limit=20';
            if (extend && extend.area) {
                apiUrl += '&area=' + extend.area;
            }
            var html = fetch(apiUrl, {
                headers: rule.headers,
                method: 'GET'
            });
            var json = JSON.parse(html);
            if (json && json.list) {
                for (var i = 0; i < json.list.length; i++) {
                    var item = json.list[i];
                    var key = item.vod_name || '';
                    if (key && !seen[key]) {
                        seen[key] = true;
                        videos.push({
                            vod_id: item.vod_id || (sortedSources[s].name + '_' + tid + '_' + i),
                            vod_name: item.vod_name || '未知',
                            vod_pic: item.vod_pic || '',
                            vod_remarks: '[' + sortedSources[s].name + '] ' + (item.vod_remarks || item.vod_state || ''),
                            source: sortedSources[s].name,
                        });
                    }
                }
            }
        } catch (e) {}
        if (videos.length >= 20) break;
    }
    
    return JSON.stringify({
        page: pg,
        pagecount: 10,
        limit: 20,
        total: videos.length,
        list: videos,
    });
}

function detail(id) {
    var vod = null;
    
    // 尝试从各个源获取详情
    for (var s = 0; s < ONLINE_SOURCES.length; s++) {
        if (!ONLINE_SOURCES[s].enabled) continue;
        try {
            var apiUrl = ONLINE_SOURCES[s].api + '?ac=detail&ids=' + id;
            var html = fetch(apiUrl, {
                headers: rule.headers,
                method: 'GET'
            });
            var json = JSON.parse(html);
            if (json && json.list && json.list.length > 0) {
                var item = json.list[0];
                vod = {
                    vod_id: item.vod_id || id,
                    vod_name: item.vod_name || '未知',
                    vod_pic: item.vod_pic || '',
                    vod_desc: item.vod_remarks || item.vod_state || '',
                    vod_content: item.vod_content || item.vod_blurb || '',
                    vod_play_from: item.vod_play_from || ('[' + ONLINE_SOURCES[s].name + ']'),
                    vod_play_url: item.vod_play_url || '',
                };
                break;
            }
        } catch (e) {}
    }
    
    if (!vod) {
        vod = {
            vod_id: id,
            vod_name: '未知资源',
            vod_pic: '',
            vod_desc: '',
            vod_content: '',
            vod_play_from: '在线影视',
            vod_play_url: '',
        };
    }
    
    return JSON.stringify({ list: [vod] });
}

function play(flag, id, flags) {
    var url = id;
    
    // 如果已经是直链（m3u8/mp4），直接播放
    if (url.indexOf('.m3u8') > -1 || url.indexOf('.mp4') > -1 || url.indexOf('.m3u') > -1) {
        return JSON.stringify({ parse: 0, url: url });
    }
    
    // 如果来自特定平台的直链
    if (url.indexOf('iqiyi.com') > -1 || url.indexOf('qq.com') > -1 || 
        url.indexOf('youku.com') > -1 || url.indexOf('mgtv.com') > -1) {
        // 使用解析接口
        var parseUrl = selectBestParse(url);
        return JSON.stringify({ parse: 1, jx: 1, url: url, parseUrl: parseUrl });
    }
    
    // 默认使用解析
    return JSON.stringify({ parse: 1, jx: 1, url: url });
}

function search(wd, quick, pg) {
    if (pg <= 0) pg = 1;
    var videos = [];
    var seen = {};
    
    var sortedSources = ONLINE_SOURCES.filter(function(s) { return s.enabled; }).sort(function(a, b) { return b.weight - a.weight; });
    
    for (var s = 0; s < sortedSources.length; s++) {
        try {
            var apiUrl = sortedSources[s].api + '?ac=detail&wd=' + encodeURIComponent(wd) + '&pg=' + pg;
            var html = fetch(apiUrl, {
                headers: rule.headers,
                method: 'GET'
            });
            var json = JSON.parse(html);
            if (json && json.list) {
                for (var i = 0; i < json.list.length; i++) {
                    var item = json.list[i];
                    var key = item.vod_name || '';
                    if (key && !seen[key]) {
                        seen[key] = true;
                        videos.push({
                            vod_id: item.vod_id || (sortedSources[s].name + '_s_' + i),
                            vod_name: item.vod_name || '未知',
                            vod_pic: item.vod_pic || '',
                            vod_remarks: '[' + sortedSources[s].name + '] ' + (item.vod_remarks || item.vod_state || ''),
                            source: sortedSources[s].name,
                        });
                    }
                }
            }
        } catch (e) {}
        if (videos.length >= 30) break;
    }
    
    return JSON.stringify({
        page: pg,
        pagecount: 10,
        limit: 30,
        total: videos.length,
        list: videos,
    });
}

// 选择最佳解析接口
function selectBestParse(url) {
    // 根据URL特征选择最合适的解析接口
    if (url.indexOf('iqiyi.com') > -1 || url.indexOf('qiyi') > -1) {
        return PARSE_URLS[0];
    }
    if (url.indexOf('qq.com') > -1) {
        return PARSE_URLS[1];
    }
    if (url.indexOf('youku.com') > -1) {
        return PARSE_URLS[2];
    }
    if (url.indexOf('mgtv.com') > -1) {
        return PARSE_URLS[3];
    }
    return PARSE_URLS[0]; // 默认
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
