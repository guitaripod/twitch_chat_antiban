ProxyChat = {

    socket: null,
    channel: null,
    channelId: null,
    messages: [],
    thirdPartyEmotes: {},
    thirdPartyEmoteCodesByPriority: [],
    badges: {},
    pingIntervalID: null,

    loadChannelData: async function () {
        const channelId = await getTwitchUserId(ProxyChat.channel);
        if (channelId === null) {
            ProxyChat.log(`Unable to fetch channel ID for channel name: ${ProxyChat.channel}`);
        } else {
            ProxyChat.channelId = channelId;
            await ProxyChat.loadThirdPartyEmotes();
            await ProxyChat.loadTwitchBadges();
        }
    },

    loadTwitchBadges: async function () {
        const globalBadges = await getTwitchBadges('global');
        const channelBadges = await getTwitchBadges(ProxyChat.channelId);
        ProxyChat.parseTwitchBadges(globalBadges ?? []);
        ProxyChat.parseTwitchBadges(channelBadges ?? []);
    },

    loadThirdPartyEmotes: async function () {
        ProxyChat.thirdPartyEmotes = {};
        ProxyChat.thirdPartyEmoteCodesByPriority = [];

        for (const endpoint of ['emotes/global', `users/twitch/${ProxyChat.channelId}`]) {
            const ffzEmotes = await fetchJson(`https://api.betterttv.net/3/cached/frankerfacez/${endpoint}`);
            (ffzEmotes ?? []).forEach(emote => {
                ProxyChat.thirdPartyEmotes[emote.code] = {
                    id: emote.id,
                    src: emote.images['4x'] || emote.images['2x'] || emote.images['1x']
                };
            });
        }

        for (const endpoint of ['emotes/global', `users/twitch/${ProxyChat.channelId}`]) {
            let bttvEmotes = await fetchJson(`https://api.betterttv.net/3/cached/${endpoint}`);
            bttvEmotes = Array.isArray(bttvEmotes) ? bttvEmotes : bttvEmotes?.channelEmotes.concat(bttvEmotes?.sharedEmotes) ?? [];
            bttvEmotes?.forEach(emote => {
                ProxyChat.thirdPartyEmotes[emote.code] = {
                    id: emote.id,
                    src: `https://cdn.betterttv.net/emote/${emote.id}/3x`
                };
            });
        }

        for (const endpoint of ['emote-sets/global', `users/twitch/${ProxyChat.channelId}`]) {
            const stvEmotes = await fetchJson(`https://7tv.io/v3/${endpoint}`);
            const emotes = stvEmotes?.emote_set?.emotes ?? stvEmotes?.emotes ?? [];
            emotes?.forEach(emote => {
                if (emote?.data?.host?.files?.length && emote.data.host.url?.trim()) {
                    const bestQualityEmote = emote.data.host.files.pop();
                    const lowestQualityEmote = emote.data.host.files.shift();
                    ProxyChat.thirdPartyEmotes[emote.name] = {
                        id: emote.id,
                        src: `https:${emote.data.host.url}/${bestQualityEmote.name}`,
                        width: `${lowestQualityEmote.width / 10}rem`,
                        height: `${lowestQualityEmote.height / 10}rem`
                    };
                }
            });
        }

        // store emotes priority by its length
        ProxyChat.thirdPartyEmoteCodesByPriority = Object.keys(ProxyChat.thirdPartyEmotes);
        ProxyChat.thirdPartyEmoteCodesByPriority.sort((a, b) => b.length - a.length);
    },

    parseTwitchBadges: function (badgeData) {
        for (const badge of badgeData ?? []) {
            const src1x = badge.imageURL;
            if (!src1x) continue;
            const src4x = src1x.replace(/\/\d+$/, '/3');
            ProxyChat.badges[`${badge.setID}/${badge.version}`] = {src1x, src4x};
        }
    },

    replaceTwitchEmotes: function (message) {
        if (!message.emotes) return message.msg;
        let msg = message.msg;
        const emoteCodes = {};

        message.emotes.split("/").forEach((emote) => {
            const [emoteIndex, ranges] = emote.split(":");
            ranges.split(",").forEach((range) => {
                const [start, end] = range.split("-");
                const emoteCode = message.msg.substring(parseInt(start), parseInt(end) + 1);
                emoteCodes[emoteCode] = {
                    src: `https://static-cdn.jtvnw.net/emoticons/v2/${emoteIndex}/default/dark/3.0`
                };
            });
        });

        for (const emote of Object.keys(emoteCodes)) {
            const emoteHtml = ProxyChat.wrapEmote(emoteCodes[emote]);
            const regex = new RegExp(`(?<!\\S)(${escapeRegExp(emote)})(?!\\S)`, 'g');
            msg = msg.replace(regex, emoteHtml);
        }

        return msg;
    },

    replaceThirdPartyEmotes: function (msg) {
        for (const emoteCode of ProxyChat.thirdPartyEmoteCodesByPriority) {
            const emoteHtml = ProxyChat.wrapEmote(ProxyChat.thirdPartyEmotes[emoteCode]);
            const regex = new RegExp(`(?<!\\S)(${escapeRegExp(emoteCode)})(?!\\S)`, 'g');
            msg = msg.replace(regex, emoteHtml);
        }

        return msg;
    },

    wrapUsername: function (message) {
        const usernameElement = $('<span class="chat-author__display-name"></span>');
        const color = message.color || twitchColors[message['display-name'].charCodeAt(0) % 16];
        usernameElement.css('color', color);
        usernameElement.html(message['display-name'] ?? message.source.nickname);
        return usernameElement;
    },

    wrapMessage: function (message) {
        const messageElement = $('<span></span>');
        if (message.action) {
            const color = message.color || this.twitchColors[message['display-name'].charCodeAt(0) % 16];
            messageElement.css('color', color);
        }
        let msgWithEmotes;
        msgWithEmotes = ProxyChat.replaceTwitchEmotes(message);
        msgWithEmotes = ProxyChat.replaceThirdPartyEmotes(msgWithEmotes);
        messageElement.html(msgWithEmotes);
        return messageElement;
    },

    wrapEmote: function (emote) {
        const imgStyle = emote.width || emote.height ? `style="width: ${emote.width || 'auto'}; height: ${emote.height || 'auto'};"` : '';
        return `<div class="inline-image">
                    <div class="chat-image__container" ${imgStyle}>
                        <img class="chat-image chat-line__message--emote" src="${emote.src}"/>
                    </div>
                </div>`;
    },

    wrapBadge: function (badgeData) {
        return `<div class="inline-image">
                    <div class="chat-badge">
                        <img class="chat-image" src="${badgeData.src1x}" srcset="${badgeData.src1x} 1x, ${badgeData.src4x} 4x"/>
                    </div>
                </div>`;
    },

    wrapBadges: function (message) {
        let badges = [];
        if (message.badgeSources) {
            message.badgeSources.forEach(source => {
                badges.push(ProxyChat.wrapBadge({src1x: source.src, src4x: source.src.replace(/\/\d+$/, '/3')}));
            });
            return badges;
        }
        if (message.badges) {
            message.badges.split(',').forEach(badge => {
                if (badge in ProxyChat.badges) {
                    const badgeData = ProxyChat.badges[badge];
                    badges.push(ProxyChat.wrapBadge(badgeData));
                }
            });
        }
        return badges;
    },

    log: function (message) {
        console.log(`Twitch Anti-Ban: ${message}`);
    },

    nextLocalMessageId: 1,
    lastLocalMessage: '',

    selfIdentity: null,

    getPageAuthToken: function () {
        const existing = document.documentElement.getAttribute('antiban-token');
        if (existing) return existing;
        const script = document.createElement('script');
        script.textContent = `
            try {
                document.documentElement.setAttribute('antiban-token', localStorage.getItem('authToken') || '');
            } catch (e) {
                document.documentElement.setAttribute('antiban-token', '');
            }
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
        return document.documentElement.getAttribute('antiban-token') || '';
    },

    getSelfIdentity: async function () {
        if (ProxyChat.selfIdentity) return ProxyChat.selfIdentity;
        const oauthToken = ProxyChat.getPageAuthToken();
        const headers = {
            'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
            'Content-Type': 'application/json'
        };
        if (oauthToken) {
            headers['Authorization'] = `OAuth ${oauthToken}`;
        }
        const data = await fetchJson('https://gql.twitch.tv/gql', 'POST', headers, JSON.stringify({
            query: 'query { currentUser { id login displayName chatColor displayBadges { setID version imageURL(size: NORMAL) } } }'
        }));
        const me = data?.data?.currentUser;
        if (!me) {
            ProxyChat.selfIdentity = {name: 'guitaripod', color: '#00FFFF', badges: ''};
            return ProxyChat.selfIdentity;
        }
        ProxyChat.selfIdentity = {
            name: me.displayName || me.login || 'guitaripod',
            color: me.chatColor || twitchColors[me.login.charCodeAt(0) % twitchColors.length],
            badges: (me.displayBadges ?? []).map(b => `${b.setID}/${b.version}`).join(','),
            badgeSources: (me.displayBadges ?? []).map(b => ({key: `${b.setID}/${b.version}`, src: b.imageURL})),
            userId: me.id
        };
        return ProxyChat.selfIdentity;
    },

    inputEnforceInterval: null,

    banPlaceholderVisible: function (realInput) {
        const placeholder = document.querySelector('.chat-wysiwyg-input__placeholder');
        return placeholder && /banned from chat|timed out/i.test(placeholder.textContent || '');
    },

    initInput: function () {
        if (ProxyChat.inputEnforceInterval) return;
        const supervise = () => {
            try {
                if (!exists('#anti-ban-chat')) {
                    clearInterval(ProxyChat.inputEnforceInterval);
                    ProxyChat.inputEnforceInterval = null;
                    return;
                }
                const realInput = document.querySelector('[data-a-target="chat-input"], .chat-wysiwyg-input__editor');
                if (!realInput || !realInput.isConnected) return;

                const disabled = !realInput.isContentEditable || ProxyChat.banPlaceholderVisible(realInput);
                if (disabled) {
                    ProxyChat.replaceWithOwnInput(realInput);
                } else if (document.querySelector('.anti-ban-input-box')) {
                    ProxyChat.unreplaceWithOwnInput(realInput);
                    ProxyChat.hookRealInput(realInput);
                } else if (!realInput.dataset.antibanHooked) {
                    ProxyChat.hookRealInput(realInput);
                }
                ProxyChat.enableSendButton();
            } catch (error) {
                console.error('Twitch Anti-Ban: input tick error:', error);
            }
        };
        supervise();
        ProxyChat.inputEnforceInterval = setInterval(supervise, 1000);
    },



    enableSendButton: function () {
        const button = Array.from(document.querySelectorAll('button')).find(b =>
            b.getAttribute('data-a-target') === 'chat-send-button' ||
            (b.textContent.trim() === 'Chat' && !b.closest('.chat-list--default')));
        if (!button) return;
        if (button.disabled) button.disabled = false;
        if (button.getAttribute('aria-disabled')) button.removeAttribute('aria-disabled');
        button.className = button.className.replace(/ScCoreButton--disabled[a-z-]*/g, '');
        button.classList.add('ScCoreButton--brand');
        button.style.cssText = `
            background-color: #9147ff !important;
            color: #ffffff !important;
            opacity: 1 !important;
            cursor: pointer !important;
        `;
        if (!button.dataset.antibanHooked) {
            button.dataset.antibanHooked = 'true';
            button.addEventListener('click', function (e) {
                const editable = document.querySelector('.anti-ban-input-box');
                if (!editable) return;
                const text = editable.textContent.trim();
                if (!text) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    return;
                }
                e.preventDefault();
                e.stopImmediatePropagation();
                if (text.startsWith('/') && !text.startsWith('/me ')) {
                    ProxyChat.clearEditor(editable);
                    return;
                }
                ProxyChat.sendLocalMessage(text);
                ProxyChat.lastLocalMessage = text;
                ProxyChat.clearEditor(editable);
            }, true);
        }
    },

    hookRealInput: function (realInput) {
        if (realInput.dataset.antibanHooked) return;
        realInput.dataset.antibanHooked = 'true';
        realInput.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
            const text = (realInput.textContent || '').trim();
            if (!text) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (text.startsWith('/') && !text.startsWith('/me ')) {
                ProxyChat.clearEditor(realInput);
                return;
            }
            ProxyChat.sendLocalMessage(text);
            ProxyChat.lastLocalMessage = text;
            ProxyChat.clearEditor(realInput);
        }, true);
        realInput.addEventListener('keyup', function (e) {
            if (e.key === 'ArrowUp' && !(realInput.textContent || '').trim() && ProxyChat.lastLocalMessage) {
                realInput.focus();
                document.execCommand('selectAll', false, null);
                document.execCommand('insertText', false, ProxyChat.lastLocalMessage);
            }
        }, true);
    },

    replaceWithOwnInput: function (realInput) {
        const editorBox = realInput.closest('.chat-wysiwyg-input-box') || realInput.parentElement;
        if (!editorBox || !editorBox.isConnected) return;
        let ours = document.querySelector('.anti-ban-input-container');
        if (ours && (!ours.isConnected || (ours.previousElementSibling !== editorBox && ours.parentElement !== editorBox.parentElement))) {
            editorBox.after(ours);
        }
        const cs = getComputedStyle(editorBox);
        const editorCs = getComputedStyle(realInput);
        const placeholder = document.querySelector('.chat-wysiwyg-input__placeholder');
        const placeholderColor = placeholder ? getComputedStyle(placeholder).color : '#adadb8';
        if (!ours) {
            ours = document.createElement('div');
            ours.className = 'anti-ban-input-container';
            ours.innerHTML = `<div class="anti-ban-input-box" contenteditable="true" role="textbox" aria-label="Send a message"></div>`;
            ours.style.cssText = `
                background-color: ${cs.backgroundColor};
                border-radius: ${cs.borderRadius};
                box-shadow: ${cs.boxShadow};
                flex-grow: 1;
                min-width: 0;
            `;
            const boxEl = ours.querySelector('.anti-ban-input-box');
            boxEl.style.cssText = `
                color: ${editorCs.color};
                font-size: ${editorCs.fontSize};
                line-height: ${editorCs.lineHeight};
                font-family: ${editorCs.fontFamily};
                font-weight: ${editorCs.fontWeight};
                padding: ${editorCs.paddingTop} 10px ${editorCs.paddingBottom} 10px;
            `;
            boxEl.style.setProperty('--anti-ban-placeholder-color', placeholderColor);
            const editable = ours.querySelector('.anti-ban-input-box');
            const updateEmpty = () => {
                editable.classList.toggle('anti-ban-empty', !editable.textContent.trim());
            };
            editable.classList.add('anti-ban-empty');
            editable.addEventListener('input', updateEmpty);
            ours.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const text = editable.textContent.trim();
                    if (!text) return;
                    if (text.startsWith('/') && !text.startsWith('/me ')) {
                        ProxyChat.clearEditor(editable);
                        updateEmpty();
                        return;
                    }
                    ProxyChat.sendLocalMessage(text);
                    ProxyChat.lastLocalMessage = text;
                    ProxyChat.clearEditor(editable);
                    updateEmpty();
                } else if (e.key === 'ArrowUp' && !editable.textContent.trim() && ProxyChat.lastLocalMessage) {
                    e.preventDefault();
                    editable.focus();
                    document.execCommand('selectAll', false, null);
                    document.execCommand('insertText', false, ProxyChat.lastLocalMessage);
                    updateEmpty();
                }
            });
        }
        const hadFocus = document.activeElement === ours.querySelector('.anti-ban-input-box');
        if (ours.previousElementSibling !== editorBox || !editorBox.parentElement.contains(ours)) {
            editorBox.after(ours);
        }
        editorBox.style.setProperty('display', 'none', 'important');
        if (hadFocus) {
            ours.querySelector('.anti-ban-input-box').focus();
        }
        const row = editorBox.closest('.chat-input');
        if (row) {
            const oursRect = ours.getBoundingClientRect();
            row.querySelectorAll('*').forEach(el => {
                if (el === ours || ours.contains(el) || el.contains(ours)) return;
                if (el === editorBox || editorBox.contains(el)) return;
                const p = getComputedStyle(el).position;
                if (p !== 'absolute' && p !== 'fixed') return;
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) return;
                const overlaps = r.left < oursRect.right && r.right > oursRect.left && r.top < oursRect.bottom && r.bottom > oursRect.top;
                if (overlaps) {
                    el.style.setProperty('display', 'none', 'important');
                }
            });
        }
    },

    unreplaceWithOwnInput: function () {
        document.querySelectorAll('.anti-ban-input-container').forEach(el => {
            if (el.closest('.chat-input')) el.remove();
        });
        const editorBox = document.querySelector('.chat-wysiwyg-input-box');
        if (editorBox) {
            editorBox.style.removeProperty('display');
        }
    },

    clearEditor: function (target) {
        if (target.classList.contains('anti-ban-input-box')) {
            target.innerHTML = '';
            target.classList.add('anti-ban-empty');
            return;
        }
        target.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
    },

    sendLocalMessage: async function (text) {
        let action = false;
        if (text.startsWith('/me ')) {
            action = true;
            text = text.slice(4).trim();
            if (!text) return;
        }
        const self = await ProxyChat.getSelfIdentity();
        ProxyChat.writeChat({
            'display-name': self.name,
            color: self.color,
            badges: self.badges || '',
            badgeSources: self.badgeSources || [],
            'user-id': self.userId || 'self',
            id: `anti-ban-local-${ProxyChat.nextLocalMessageId++}`,
            action: action,
            msg: text
        });
    },

    clearMessage: function (messageId) {
        setTimeout(function () {
            $(`.chat-line[data-id=${messageId}]`).remove();
        }, 100);
    },

    clearAllMessages: function (userId) {
        setTimeout(function () {
            $(`.chat-line[data-user-id=${userId}]`).remove();
        }, 100);
    },

    initChat: function () {
        let proxyChat = $(`<div id="anti-ban-chat"></div>`);
        let chatPaused = $(`<div class="anti-ban-chat-paused"><span>Scroll Down</span></div>`);
        let chatContainer = $('.chat-room__content').children().first();
        chatContainer.removeClass();
        chatContainer.addClass("chat-list--default");
        chatContainer.html(proxyChat);
        chatContainer.attr('style', 'display: block !important;');
        chatContainer.append(chatPaused);
        chatPaused.on("click", () => {
            const chatContainer = $('.chat-list--default');
            chatContainer.scrollTop(chatContainer.prop('scrollHeight') - chatContainer.innerHeight());
            $('.anti-ban-chat-paused').hide();
        });
        chatPaused.hide();
        ProxyChat.initInput();
    },

    backfillHistory: async function () {
        try {
            const data = await fetchJson(`https://recent-messages.robotty.de/api/v2/recent-messages/${ProxyChat.channel}`);
            if (!data?.messages?.length) return;
            const lines = data.messages.slice(-50).map(line => parseIRCMessage(line));
            lines.forEach(message => {
                if (message.command === 'PRIVMSG' && message.msg && message.channel?.toLowerCase() === ProxyChat.channel) {
                    ProxyChat.writeChat(message);
                }
            });
        } catch (error) {
            ProxyChat.log(`Unable to backfill chat history: ${error}`);
        }
    },

    updateChat: setInterval(function () {
        if (ProxyChat.messages.length > 0) {
            ProxyChat.messages.forEach(message => {
                const chatContainer = $('.chat-list--default');
                const isScrolledNearBottom = chatContainer.prop('scrollHeight') - chatContainer.innerHeight() <= chatContainer.scrollTop() + chatContainer.innerHeight() * 0.2; // 20% from bottom of container
                $('#anti-ban-chat').append(message);
                if (isScrolledNearBottom) {
                    chatContainer.scrollTop(chatContainer.prop('scrollHeight') - chatContainer.innerHeight());
                    $('.anti-ban-chat-paused').hide();
                } else {
                    $('.anti-ban-chat-paused').show();
                }
            })
            ProxyChat.messages = [];
            $('.chat-line:lt(-200)').remove();
        }
    }, 200),

    writeChat: function (message) {
        const chatLine = $('<div></div>');
        const userInfo = $('<span></span>');
        chatLine.addClass('chat-line chat-line__message');
        chatLine.attr('data-user-id', message['user-id']);
        chatLine.attr('data-id', message.id);
        ProxyChat.wrapBadges(message).forEach(badge => {
            userInfo.append(badge);
        });
        userInfo.append(ProxyChat.wrapUsername(message));
        userInfo.append(message.action ? '<span>&nbsp;</span>' : '<span class="colon">: </span>');

        chatLine.append(userInfo);
        chatLine.append(ProxyChat.wrapMessage(message));
        ProxyChat.messages.push(chatLine.wrap('<div>').parent().html());
    },

    connect: function (channel) {
        if (ProxyChat.socket) {
            ProxyChat.socket.onclose = function () {};
            ProxyChat.disconnect();
        }
        ProxyChat.channel = channel.toLowerCase();

        let disconnectTimeout;
        let lastDisconnectedTime = null;
        const reconnectionThreshold = 5000;

        ProxyChat.loadChannelData().then(() => {
            if (!ProxyChat.channelId) return;

            ProxyChat.backfillHistory();
            ProxyChat.log('Connecting to chat server...');
            ProxyChat.socket = new ReconnectingWebSocket('wss://irc-ws.chat.twitch.tv', 'irc', {reconnectInterval: 2000});

            ProxyChat.socket.onopen = function () {
                clearTimeout(disconnectTimeout);
                if (lastDisconnectedTime === null || (Date.now() - lastDisconnectedTime) > reconnectionThreshold) {
                    ProxyChat.log(`Connected to #${ProxyChat.channel}`);
                }
                ProxyChat.socket.send('PASS pass\r\n');
                ProxyChat.socket.send(`NICK justinfan${Math.floor(Math.random() * 999999)}\r\n`);
                ProxyChat.socket.send('CAP REQ :twitch.tv/commands twitch.tv/tags\r\n');
                ProxyChat.socket.send(`JOIN #${ProxyChat.channel}\r\n`);

                clearInterval(ProxyChat.pingIntervalID);
                ProxyChat.pingIntervalID = setInterval(function () {
                    ProxyChat.socket.send('PING\r\n');
                }, 4 * 60 * 1000);
            };

            ProxyChat.socket.ontimeout = function () {
                ProxyChat.log('Connection timeout, reconnecting...');
            };

            ProxyChat.socket.onclose = function () {
                clearInterval(ProxyChat.pingIntervalID);
                lastDisconnectedTime = Date.now();
                disconnectTimeout = setTimeout(function () {
                    ProxyChat.log('Disconnected');
                }, reconnectionThreshold);
            };

            ProxyChat.socket.onmessage = function (data) {
                data.data.split('\r\n').forEach(line => {
                    if (!line) return;
                    const message = parseIRCMessage(line);

                    switch (message.command) {
                        case "PING":
                            ProxyChat.socket.send(`PONG ${message.msg}\r\n`);
                            return;
                        case "JOIN":
                            ProxyChat.log(`Joined channel: ${ProxyChat.channel}`);
                            return;
                        case "CLEARMSG":
                            if (message['target-msg-id']) ProxyChat.clearMessage(message['target-msg-id']);
                            return;
                        case "CLEARCHAT":
                            if (message['target-user-id']) ProxyChat.clearAllMessages(message['target-user-id']);
                            return;
                        case "PRIVMSG":
                            if (message.channel.toLowerCase() !== ProxyChat.channel || !message.msg) return;
                            ProxyChat.writeChat(message);
                            return;
                    }
                });
            };
        });
    },

    disconnect: function () {
        if (ProxyChat.socket) {
            ProxyChat.socket.close();
            ProxyChat.socket = null;
        }
        if (ProxyChat.pingIntervalID) {
            clearInterval(ProxyChat.pingIntervalID);
            ProxyChat.pingIntervalID = null;
        }
    }
}
