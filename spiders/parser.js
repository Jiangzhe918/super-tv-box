// ============================================================
// 视频解析聚合模块
// 自动选择最佳解析线路，支持多平台视频解析
// 适配 Fongmi/TVBox Spider JS 引擎
// ============================================================

var rule = {
    title: '视频解析聚合',
    host: '',
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    play_parse: true,
    lazy: '',
};

// 解析接口配置 - 按优先级排列
var PARSE_APIS = [
    {
        name: '虾米解析',
        url: 'https://jx.xmflv.com/?url=',
        type: 'web',
        priority: 10,
        platforms: ['qq', 'iqiyi', 'youku', 'mgtv', 'sohu', 'letv', 'bilibili'],
    },
    {
        name: '夜幕解析',
        url: 'https://www.yemu.xyz/?url=',
        type: 'web',
        priority: 9,
        platforms: ['qq', 'iqiyi', 'youku', 'mgtv'],
    },
    {
        name: 'BL解析',
        url: 'https://jx.blbo.cc/?url=',
        type: 'web',
        priority: 8,
        platforms: ['qq', 'iqiyi', 'youku', 'mgtv', 'sohu'],
    },
    {
        name: '魔汤解析',
        url: 'https://www.mtosz.com/m3u8.php?url=',
        type: 'web',
        priority: 7,
        platforms: ['qq', 'iqiyi', 'youku'],
    },
    {
        name: '极速解析',
        url: 'https://api.jiexi.la/?url=',
        type: 'api',
        priority: 8,
        platforms: ['qq', 'iqiyi', 'youku', 'mgtv', 'sohu'],
    },
    {
        name: '虾米CC解析',
        url: 'https://jx.xmflv.cc/?url=',
        type: 'web',
        priority: 7,
        platforms: ['qq', 'iqiyi', 'youku', 'mgtv', 'sohu', 'letv'],
    },
    {
        name: 'OK解析',
        url: 'https://api.okjx.cc/?url=',
        type: 'web',
        priority: 6,
        platforms: ['qq', 'iqiyi', 'youku', 'mgtv'],
    },
    {
        name: '爱豆解析',
        url: 'https://jx.aidouer.net/?url=',
        type: 'web',
        priority: 6,
        platforms: ['qq', 'iqiyi', 'youku'],
    },
];

// 平台识别规则
var PLATFORM_RULES = [
    { name: 'qq', patterns: ['v.qq.com', 'qq.com', '腾讯视频'] },
    { name: 'iqiyi', patterns: ['iqiyi.com', 'qiyi.com', '爱奇艺'] },
    { name: 'youku', patterns: ['youku.com', '优酷'] },
    { name: 'mgtv', patterns: ['mgtv.com', '芒果TV'] },
    { name: 'sohu', patterns: ['sohu.com', '搜狐视频'] },
    { name: 'letv', patterns: ['letv.com', 'le.com', '乐视'] },
    { name: 'bilibili', patterns: ['bilibili.com', 'b23.tv', 'B站'] },
    { name: 'pptv', patterns: ['pptv.com', 'PPTV'] },
    { name: 'migu', patterns: ['miguvideo.com', '咪咕'] },
];

function init(ext) {}

function play(flag, id, flags) {
    var url = id;
    
    // 1. 检查是否为直链
    if (isDirectLink(url)) {
        return JSON.stringify({ parse: 0, url: url });
    }
    
    // 2. 识别平台
    var platform = detectPlatform(url);
    
    // 3. 选择最佳解析接口
    var bestParse = selectParse(url, platform);
    
    if (bestParse) {
        return JSON.stringify({
            parse: 1,
            jx: 1,
            url: url,
            parseUrl: bestParse.url + url,
            header: JSON.stringify({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': bestParse.url,
            }),
        });
    }
    
    // 4. 兜底：交给播放器内置解析
    return JSON.stringify({ parse: 1, jx: 1, url: url });
}

function isDirectLink(url) {
    if (!url) return false;
    var directExts = ['.m3u8', '.mp4', '.mkv', '.avi', '.flv', '.ts', '.m3u'];
    for (var i = 0; i < directExts.length; i++) {
        if (url.toLowerCase().indexOf(directExts[i]) > -1) {
            return true;
        }
    }
    return false;
}

function detectPlatform(url) {
    if (!url) return '';
    url = url.toLowerCase();
    for (var i = 0; i < PLATFORM_RULES.length; i++) {
        var p = PLATFORM_RULES[i];
        for (var j = 0; j < p.patterns.length; j++) {
            if (url.indexOf(p.patterns[j]) > -1) {
                return p.name;
            }
        }
    }
    return '';
}

function selectParse(url, platform) {
    // 优先选择支持该平台的、优先级最高的解析接口
    var candidates = [];
    for (var i = 0; i < PARSE_APIS.length; i++) {
        var api = PARSE_APIS[i];
        if (platform && api.platforms.indexOf(platform) > -1) {
            candidates.push(api);
        } else if (!platform) {
            candidates.push(api);
        }
    }
    
    // 按优先级排序
    candidates.sort(function(a, b) { return b.priority - a.priority; });
    
    return candidates.length > 0 ? candidates[0] : PARSE_APIS[0];
}

function __js__() {
    return {
        init: init,
        play: play,
        rule: rule,
    };
}
