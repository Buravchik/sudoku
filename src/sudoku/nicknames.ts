import { Lang } from '@/i18n';
import { GameSettingsType } from '@/types';
import { DEFAULT_SETTINGS } from './storage';

/**
 * Each checkbox is one bit, lowest bit first. Append new keys at the end.
 * A new key must default to false: then every existing name stays put.
 * Never reorder these keys or the words below. To name the extra bit,
 * append words to one list so adjectives × nouns is at least 2^bits.
 * The two languages are parallel indexes, so the same pair of positions
 * is the same settings in either language.
 */
export const NICKNAME_BITS: (keyof GameSettingsType)[] = [
  'highlightRowAndColumn',
  'highlightSameNumbers',
  'highlightSameHints',
  'highlightCrossForNumbers',
  'highlightCrossForHints',
  'hideImpossibleValuesInSelector',
  'hideImpossibleValuesInHints',
  'highlightCurrentQuadrant',
  'highlightQuadrantsWithSameNumber',
  'highlightAllObviousCells',
  'highlightObviousCellsForCurrentNumber',
  'undoMoves',
  'highlightConflicts',
  'countMistakes',
];

type Word = readonly [en: string, ru: string];

const ADJECTIVES: readonly Word[] = [
  ['doubting', 'сомневающийся'], ['brave', 'храбрый'], ['almighty', 'всесильный'], ['sleepy', 'сонный'],
  ['sly', 'хитрый'], ['pompous', 'важный'], ['bold', 'дерзкий'], ['pensive', 'задумчивый'],
  ['stubborn', 'упрямый'], ['merry', 'весёлый'], ['gloomy', 'мрачный'], ['fluffy', 'пушистый'],
  ['proud', 'гордый'], ['modest', 'скромный'], ['nimble', 'шустрый'], ['lazy', 'ленивый'],
  ['fierce', 'грозный'], ['tender', 'нежный'], ['sullen', 'хмурый'], ['crafty', 'лукавый'],
  ['daring', 'отважный'], ['absent-minded', 'рассеянный'], ['dignified', 'степенный'], ['fiery', 'пылкий'],
  ['quiet', 'тихий'], ['loud', 'шумный'], ['wise', 'мудрый'], ['naive', 'наивный'],
  ['stern', 'суровый'], ['kind', 'добрый'], ['grumpy', 'сердитый'], ['playful', 'игривый'],
  ['solemn', 'солидный'], ['timid', 'робкий'], ['dashing', 'лихой'], ['vain', 'чванливый'],
  ['shy', 'застенчивый'], ['spry', 'бодрый'], ['sluggish', 'вялый'], ['furious', 'яростный'],
  ['calm', 'спокойный'], ['curious', 'любопытный'], ['dour', 'угрюмый'], ['frisky', 'резвый'],
  ['unhurried', 'медлительный'], ['honest', 'честный'], ['boastful', 'хвастливый'], ['amusing', 'забавный'],
  ['serious', 'серьёзный'], ['frivolous', 'легкомысленный'], ['thrifty', 'запасливый'], ['hungry', 'голодный'],
  ['stuffed', 'сытый'], ['wet', 'мокрый'], ['dry', 'сухой'], ['prickly', 'колючий'],
  ['smooth', 'гладкий'], ['striped', 'полосатый'], ['spotted', 'пятнистый'], ['ginger', 'рыжий'],
  ['grey', 'седой'], ['black', 'чёрный'], ['white', 'белый'], ['blue', 'синий'],
  ['green', 'зелёный'], ['golden', 'золотой'], ['silver', 'серебряный'], ['copper', 'медный'],
  ['steel', 'стальной'], ['wooden', 'деревянный'], ['stone', 'каменный'], ['velvet', 'бархатный'],
  ['silk', 'шёлковый'], ['thundering', 'громовой'], ['foggy', 'туманный'], ['sunny', 'солнечный'],
  ['lunar', 'лунный'], ['starry', 'звёздный'], ['river', 'речной'], ['sea', 'морской'],
  ['forest', 'лесной'], ['steppe', 'степной'], ['mountain', 'горный'], ['marsh', 'болотный'],
  ['cave', 'пещерный'], ['urban', 'городской'], ['rural', 'деревенский'], ['tame', 'ручной'],
  ['wild', 'дикий'], ['night', 'ночной'], ['day', 'дневной'], ['morning', 'утренний'],
  ['evening', 'вечерний'], ['winter', 'зимний'], ['summer', 'летний'], ['autumn', 'осенний'],
  ['spring', 'весенний'], ['ancient', 'древний'], ['young', 'юный'], ['old', 'старый'],
  ['secret', 'тайный'], ['obvious', 'явный'], ['loyal', 'верный'], ['free', 'вольный'],
  ['wandering', 'бродячий'], ['settled', 'оседлый'], ['winged', 'крылатый'], ['horned', 'рогатый'],
  ['tailed', 'хвостатый'], ['whiskered', 'усатый'], ['toothy', 'зубастый'], ['clawed', 'когтистый'],
  ['scaly', 'чешуйчатый'], ['feathered', 'пернатый'], ['shaggy', 'мохнатый'], ['bald', 'лысый'],
  ['curly', 'кудрявый'], ['round', 'круглый'], ['long', 'длинный'], ['short', 'короткий'],
  ['fat', 'толстый'], ['thin', 'тонкий'], ['tall', 'высокий'], ['tiny', 'крошечный'],
  ['fast', 'быстрый'], ['slow', 'медленный'], ['warm', 'тёплый'], ['cold', 'холодный'],
];

const NOUNS: readonly Word[] = [
  ['platypus', 'утконос'], ['sturgeon', 'осётр'], ['beaver', 'бобр'], ['badger', 'барсук'],
  ['hippo', 'бегемот'], ['bison', 'бизон'], ['buffalo', 'буйвол'], ['wolf', 'волк'],
  ['raven', 'ворон'], ['sparrow', 'воробей'], ['cheetah', 'гепард'], ['vulture', 'гриф'],
  ['goose', 'гусь'], ['dolphin', 'дельфин'], ['porcupine', 'дикобраз'], ['camel', 'верблюд'],
  ['woodpecker', 'дятел'], ['raccoon', 'енот'], ['hedgehog', 'ёж'], ['ruffe', 'ёрш'],
  ['giraffe', 'жираф'], ['beetle', 'жук'], ['hare', 'заяц'], ['wisent', 'зубр'],
  ['turkey', 'индюк'], ['boar', 'кабан'], ['squid', 'кальмар'], ['kangaroo', 'кенгуру'],
  ['whale', 'кит'], ['goat', 'козёл'], ['horse', 'конь'], ['cat', 'кот'],
  ['crab', 'краб'], ['crocodile', 'крокодил'], ['rabbit', 'кролик'], ['lion', 'лев'],
  ['lemur', 'лемур'], ['leopard', 'леопард'], ['elk', 'лось'], ['manul', 'манул'],
  ['walrus', 'морж'], ['anteater', 'муравьед'], ['rhino', 'носорог'], ['deer', 'олень'],
  ['eagle', 'орёл'], ['octopus', 'осьминог'], ['peacock', 'павлин'], ['pelican', 'пеликан'],
  ['penguin', 'пингвин'], ['rooster', 'петух'], ['parrot', 'попугай'], ['skunk', 'скунс'],
  ['elephant', 'слон'], ['catfish', 'сом'], ['marmot', 'сурок'], ['tiger', 'тигр'],
  ['seal', 'тюлень'], ['boa', 'удав'], ['snake', 'уж'], ['owl', 'филин'],
  ['flamingo', 'фламинго'], ['hamster', 'хомяк'], ['ferret', 'хорёк'], ['jackal', 'шакал'],
  ['jaguar', 'ягуар'], ['yak', 'як'], ['hawk', 'ястреб'], ['falcon', 'сокол'],
  ['bull', 'бык'], ['ram', 'баран'], ['donkey', 'осёл'], ['mule', 'мул'],
  ['pony', 'пони'], ['fox', 'лис'], ['bear', 'медведь'], ['gopher', 'суслик'],
  ['mole', 'крот'], ['bat', 'нетопырь'], ['chipmunk', 'бурундук'], ['sable', 'соболь'],
  ['stoat', 'горностай'], ['caracal', 'каракал'], ['serval', 'сервал'], ['ocelot', 'оцелот'],
  ['tapir', 'тапир'], ['guanaco', 'гуанако'], ['aurochs', 'тур'], ['saiga', 'сайгак'],
  ['ibex', 'козерог'], ['wildebeest', 'гну'], ['okapi', 'окапи'], ['takin', 'такин'],
  ['goral', 'горал'], ['markhor', 'мархур'], ['argali', 'архар'], ['mouflon', 'муфлон'],
  ['lamb', 'ягнёнок'], ['calf', 'телёнок'], ['foal', 'жеребёнок'], ['piglet', 'поросёнок'],
  ['hog', 'боров'], ['warthog', 'бородавочник'], ['mammoth', 'мамонт'], ['dugong', 'дюгонь'],
  ['manatee', 'ламантин'], ['tyrannosaur', 'тираннозавр'], ['triceratops', 'трицератопс'], ['stegosaur', 'стегозавр'],
  ['raptor', 'велоцираптор'], ['brontosaur', 'бронтозавр'], ['diplodocus', 'диплодок'], ['ankylosaur', 'анкилозавр'],
  ['spinosaur', 'спинозавр'], ['pterosaur', 'птерозавр'], ['ichthyosaur', 'ихтиозавр'], ['plesiosaur', 'плезиозавр'],
  ['mosasaur', 'мозазавр'], ['allosaur', 'аллозавр'], ['carnotaur', 'карнотавр'], ['iguanodon', 'игуанодон'],
  ['nightingale', 'соловей'], ['bullfinch', 'снегирь'], ['thrush', 'дрозд'], ['starling', 'скворец'],
  ['rook', 'грач'], ['crane', 'журавль'], ['stork', 'аист'], ['cormorant', 'баклан'],
];

const sideOf = (lang: Lang): 0 | 1 => lang === 'ru' ? 1 : 0;

export function maskFromSettings(settings: Partial<GameSettingsType>): number {
  return NICKNAME_BITS.reduce((mask, key, index) => {
    const value = settings[key] ?? DEFAULT_SETTINGS[key];
    return value ? mask + 2 ** index : mask;
  }, 0);
}

export function settingsFromMask(mask: number): GameSettingsType {
  const settings = { ...DEFAULT_SETTINGS };
  NICKNAME_BITS.forEach((key, index) => {
    settings[key] = (mask & (2 ** index)) !== 0;
  });
  return settings;
}

export function nicknameIndexes(settings: Partial<GameSettingsType>): { adjective: number; noun: number } {
  const mask = maskFromSettings(settings);
  return {
    noun: mask % NOUNS.length,
    adjective: Math.floor(mask / NOUNS.length),
  };
}

export function settingsFromIndexes(adjective: number, noun: number): GameSettingsType {
  return settingsFromMask(adjective * NOUNS.length + noun);
}

export function nicknameWords(lang: Lang): { adjectives: string[]; nouns: string[] } {
  const side = sideOf(lang);
  const reachable = Math.min(ADJECTIVES.length, 2 ** NICKNAME_BITS.length / NOUNS.length);
  return {
    adjectives: ADJECTIVES.slice(0, reachable).map(word => word[side]),
    nouns: NOUNS.map(word => word[side]),
  };
}

export function settingsNickname(settings: Partial<GameSettingsType>, lang: Lang): string {
  const mask = maskFromSettings(settings);
  const side = sideOf(lang);
  const noun = NOUNS[mask % NOUNS.length];
  const adjective = ADJECTIVES[Math.floor(mask / NOUNS.length)];
  if (!noun || !adjective) return String(mask);
  return `${adjective[side]} ${noun[side]}`;
}

function assertNicknameLists(): void {
  const need = 2 ** NICKNAME_BITS.length;
  const unique = (words: readonly Word[], index: 0 | 1) => new Set(words.map(word => word[index])).size === words.length;
  if (ADJECTIVES.length * NOUNS.length < need) {
    throw new Error(`Nickname lists cover ${ADJECTIVES.length * NOUNS.length} names, need ${need}`);
  }
  if (!unique(ADJECTIVES, 0) || !unique(ADJECTIVES, 1) || !unique(NOUNS, 0) || !unique(NOUNS, 1)) {
    throw new Error('Nickname words must be unique in each language');
  }
}

assertNicknameLists();
