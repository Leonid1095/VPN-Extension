// Глобальная декларация chrome.* — мы используем нативный API только там, где
// webextension-polyfill не покрывает кейс (asyncBlocking onAuthRequired, tabs.create
// из non-popup контекста). Без жёстких типов — иначе нужна @types/chrome.
declare const chrome: any;

// OffscreenCanvas доступен в service worker и popup, но в TS-конфигурации с
// "lib": ["dom", ...] — он уже типизирован. На случай если lib иной — оставляем.
