const banUiSuppressors = [
    '[data-test-selector="banned-user-message"]',
    '[data-test-selector="request-unban-link"]',
    '[data-test-selector="cooldown-text"]',
    '.banned-chat-overlay__halt',
    '.banned-chat-overlay__circle',
    '[data-a-target="player-overlay-content-gate"]',
    '.content-overlay-gate',
    '.content-overlay-gate__content',
    '[data-a-target*="banned"]',
    '.chat-input__before-chat-input-container',
];

const suppressionStyle = document.createElement('style');
suppressionStyle.id = 'anti-ban-suppression';
suppressionStyle.textContent = `${banUiSuppressors.join(', ')} { display: none !important; }`;
(document.head || document.documentElement).appendChild(suppressionStyle);

const banTextPattern = /banned from chat|you are banned|timed out from talking|banned from talking/i;

function hideBannerElement(el) {
    if (!el || el.id === 'anti-ban-chat' || el.classList.contains('anti-ban-input-box')) return;
    if (el.textContent.length > 300) return;
    el.style.setProperty('display', 'none', 'important');
}

function hideBanTextNodes(root) {
    if (root.nodeType === Node.TEXT_NODE) {
        if (banTextPattern.test(root.nodeValue)) hideBannerElement(root.parentElement);
        return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        if (banTextPattern.test(node.nodeValue)) {
            hideBannerElement(node.parentElement);
        }
    }
}

const banObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            hideBanTextNodes(node);
        }
        if (mutation.type === 'characterData' && banTextPattern.test(mutation.target.nodeValue)) {
            hideBannerElement(mutation.target.parentElement);
        }
    }
});

function startBanObserver() {
    hideBanTextNodes(document.body || document.documentElement);
    banObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startBanObserver, {once: true});
} else {
    startBanObserver();
}

function collectDebugState() {
    const input = document.querySelector('[data-a-target="chat-input"], .chat-wysiwyg-input__editor');
    const box = document.querySelector('.anti-ban-input-box');
    const describe = (el) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
            visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
            rect: {top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height)},
            inlineDisplay: el.style?.display || null,
            contentEditable: el.contentEditable,
            topAncestors: (() => {
                const out = [];
                let c = el.parentElement;
                while (c && c !== document.body && out.length < 5) {
                    const ccs = getComputedStyle(c);
                    out.push({
                        cls: (c.className?.toString() || '').slice(0, 60),
                        hidden: ccs.display === 'none' || c.style.display === 'none',
                    });
                    c = c.parentElement;
                }
                return out;
            })(),
        };
    };
    return {
        url: location.href,
        bannedNow: isBanned(),
        proxyChat: !!document.getElementById('anti-ban-chat'),
        chatLines: document.querySelectorAll('#anti-ban-chat .chat-line').length,
        chatList: !!document.querySelector('.chat-list--default'),
        realInput: describe(input),
        ourBox: describe(box),
        suppressionStyle: !!document.getElementById('anti-ban-suppression'),
        hiddenByUs: Array.from(document.querySelectorAll('[style*="important"]')).filter(el => el.style.display === 'none').map(el => ({
            cls: (el.className?.toString() || '').slice(0, 70),
            text: (el.textContent || '').trim().slice(0, 50),
        })).slice(0, 12),
    };
}

window.addEventListener('antiban-debug', () => {
    document.documentElement.setAttribute('antiban-debug', JSON.stringify(collectDebugState()));
});

window.setInterval(function () {
    if (!getChannel()) return;
    console.log('Twitch Anti-Ban debug:', JSON.stringify(collectDebugState()));
}, 5000);


const banChecks = [];
const streamBanChecks = [];

function exists(selector) {
    return $(selector).length > 0;
}

function checkTwitchLayout() {
    const now = Date.now();
    banChecks.push({ time: now, value: isBanned() });
    streamBanChecks.push({ time: now, value: isStreamBanned() });

    const threshold = now - 3000;
    while (banChecks.length && banChecks[0].time < threshold) {
        banChecks.shift();
    }
    while (streamBanChecks.length && streamBanChecks[0].time < threshold) {
        streamBanChecks.shift();
    }
}


function isBanned() {
    const placeholder = document.querySelector('.chat-wysiwyg-input__placeholder');
    if (placeholder && /banned from chat|timed out/i.test(placeholder.textContent || '')) {
        return true;
    }
    const editor = document.querySelector('[data-a-target="chat-input"], .chat-wysiwyg-input__editor');
    if (editor && !editor.isContentEditable && exists('.anti-ban-chat-takeover, #anti-ban-chat')) {
        return true;
    }
    return [
        '[data-test-selector="banned-user-message"]',
        '[data-test-selector="request-unban-link"]',
        '[data-test-selector="cooldown-text"]',
        '.banned-chat-overlay__halt',
        '.banned-chat-overlay__circle',
    ].some(exists);
}

function isStreamBanned() {
    return [
        '[data-a-target="player-overlay-content-gate"]',
        '.content-overlay-gate',
        '.content-overlay-icon',
        '.content-overlay-gate__content',
    ].some(exists);
}

function isBannedConsistent() {
    return banChecks.filter(check => check.value).length >= 3;
}

function isStreamBannedConsistent() {
    return streamBanChecks.filter(check => check.value).length >= 3;
}

function getChannel() {
    // support for embedded location
    const search = location.search.substring(1); // Remove the '?' at the start
    if (search) {
        const params = search.split('&').reduce((acc, current) => {
            if (!current) return acc;
            const [key, value] = current.split('=');
            if (key) acc[key] = value ?? '';
            return acc;
        }, {});

        if (params.channel) {
            const channel = decodeURIComponent(params.channel);
            return channel || null;
        }
    }
    // support for twitch.tv location
    const channel = location.pathname.split('/').filter(
        segment => segment && segment !== 'popout' && segment !== 'chat' && segment !== 'embed'
    ).shift();

    return channel || null;
}


$(function () {
    window.setInterval(function () {
        const currentChannel = getChannel();
        if (!currentChannel) {
            return;
        }

        checkTwitchLayout();

        if (isBanned() && !exists('#anti-ban-chat')) {
            console.log("Twitch Anti-Ban: loading proxy chat");
            ProxyChat.initChat();
            ProxyChat.connect(currentChannel);
        }

        if (exists('#anti-ban-chat') && !$('.chat-list--default').length) {
            console.log("Twitch Anti-Ban: chat room rebuilt, re-initializing");
            ProxyChat.initChat();
            ProxyChat.backfillHistory();
            ProxyChat.inputEnforceInterval = null;
            ProxyChat.initInput();
        }

        if (isStreamBannedConsistent() && !exists('#anti-ban-stream')) {
            console.log("Twitch Anti-Ban: loading proxy stream");
            ProxyStream.restoreOriginalPlayer();
            ProxyStream.initStream(currentChannel);
        }

        if (ProxyStream.channel && ProxyStream.channel !== currentChannel) {
            console.log("Twitch Anti-Ban: restoring original player");
            ProxyStream.restoreOriginalPlayer();
        }

        if ((ProxyChat.channel || ProxyChat.socket) && ProxyChat.channel !== currentChannel.toLowerCase()) {
            ProxyChat.disconnect();
            ProxyChat.channel = null;
            if (exists('#anti-ban-chat')) {
                $('#anti-ban-chat').empty();
            }
        }
    }, 250);
})
