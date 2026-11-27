export const modes = {
  hex: '海克斯大乱斗',
  ranked: '单双排',
  aram: '极地大乱斗',
};

export const champions = {
  Vayne: '薇恩', Lux: '拉克丝', JarvanIV: '嘉文四世', Yasuo: '亚索',
  Jinx: '金克丝', Ahri: '阿狸', Gwen: '格温', LeeSin: '李青',
  Leona: '蕾欧娜', Thresh: '锤石', Ezreal: '伊泽瑞尔', Ornn: '奥恩',
  Lulu: '璐璐', Orianna: '奥莉安娜', Darius: '德莱厄斯', Zed: '劫',
  Aatrox: '亚托克斯', Kaisa: '卡莎', Sett: '瑟提', Ashe: '艾希',
};

export const profiles = [
  { name: '晚风落在峡谷', tag: '1729', region: '艾欧尼亚', avatar: 'Vayne',
    rank: '翡翠 II', lp: 68, wins: 24, losses: 16, games: [1, 2, 3, 4, 5, 6, 7, 8] },
  { name: '夏日回声', tag: '0826', region: '艾欧尼亚', avatar: 'Jinx',
    rank: '铂金 I', lp: 31, wins: 18, losses: 17, games: [9, 10, 11] },
];

export const matches = [
  { id: 1, champ: 'Vayne', mode: 'hex', result: 'win', score: [14, 7, 21], damage: 48562,
    duration: '17:52', age: '1 小时前', cs: 81, gold: 15820, rune: 8008,
    gear: [3153, 3006, 3124, 3046, 3091, 3072] },
  { id: 2, champ: 'Lux', mode: 'hex', result: 'loss', score: [8, 11, 24], damage: 38973,
    duration: '19:06', age: '2 小时前', cs: 67, gold: 13280, rune: 8229,
    gear: [6653, 3020, 3089, 3135, 3157] },
  { id: 3, champ: 'JarvanIV', mode: 'ranked', result: 'win', score: [7, 3, 16], damage: 21684,
    duration: '29:32', age: '3 小时前', cs: 184, gold: 13690, rune: 8010,
    gear: [3071, 3111, 3053, 3143, 3065] },
  { id: 4, champ: 'Yasuo', mode: 'aram', result: 'loss', score: [12, 12, 8], damage: 33108,
    duration: '21:38', age: '5 小时前', cs: 73, gold: 14320, rune: 8008,
    gear: [3153, 3006, 3031, 3072, 3026] },
  { id: 5, champ: 'Jinx', mode: 'ranked', result: 'win', score: [11, 2, 9], damage: 29440,
    duration: '28:14', age: '昨天', cs: 213, gold: 14260, rune: 8008,
    gear: [3031, 3006, 3085, 3094, 3036] },
  { id: 6, champ: 'Ahri', mode: 'ranked', result: 'remake', score: [0, 0, 0], damage: 137,
    duration: '03:24', age: '昨天', cs: 15, gold: 765, rune: 8112,
    gear: [2003] },
  { id: 7, champ: 'Gwen', mode: 'ranked', result: 'loss', score: [4, 7, 5], damage: 18735,
    duration: '26:48', age: '昨天', cs: 162, gold: 11280, rune: 8010,
    gear: [3115, 3047, 3089, 3135] },
  { id: 8, champ: 'LeeSin', mode: 'aram', result: 'win', score: [9, 6, 22], damage: 26714,
    duration: '18:27', age: '2 天前', cs: 54, gold: 13030, rune: 8010,
    gear: [3071, 3111, 3053, 3143, 3065] },
  { id: 9, champ: 'Jinx', mode: 'hex', result: 'win', score: [17, 5, 20], damage: 53219,
    duration: '20:15', age: '4 小时前', cs: 91, gold: 17220, rune: 8008,
    gear: [3031, 3006, 3085, 3094, 3036, 3072] },
  { id: 10, champ: 'Ahri', mode: 'ranked', result: 'loss', score: [5, 7, 12], damage: 19812,
    duration: '27:50', age: '昨天', cs: 187, gold: 12200, rune: 8112,
    gear: [6653, 3020, 3157, 3089] },
  { id: 11, champ: 'Lulu', mode: 'ranked', result: 'win', score: [2, 4, 22], damage: 9520,
    duration: '31:04', age: '2 天前', cs: 26, gold: 9940, rune: 8214,
    gear: [3107, 3158, 3222, 3190] },
];

export const skinChoices = [
  { key: 'spirit', name: '灵魂莲华' },
  { key: 'classic', name: '经典' },
  { key: 'heart', name: '觅心猎手' },
];

export const players = [
  ['Gwen', '一只小格温'], ['LeeSin', '深海来信'], ['Ahri', '莓果乌龙'],
  ['Jinx', '夏日回声'], ['Thresh', '山间听雨'], ['Orianna', '风也有归处'],
  ['Aatrox', '逆风航线'], ['Zed', '把光留住'], ['Ezreal', '夜色归途'],
  ['Ornn', '山海之间'], ['Lulu', '日光落幕'], ['Kaisa', '北岸许愿'],
];
