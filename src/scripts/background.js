const browserApi = typeof browser !== 'undefined' ? browser : chrome;

browserApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const sendCredentials = (() => {
        try {
            return new URL(request.url).hostname.endsWith('twitch.tv');
        } catch {
            return false;
        }
    })();

    if (request.type === 'fetchJson') {
        fetch(request.url, {
            method: request.method || 'GET',
            headers: request.headers || {},
            body: request.body || null,
            credentials: sendCredentials ? 'include' : 'omit'
        })
        .then(response => response.ok ? response.json() : null)
        .then(data => sendResponse(data))
        .catch(error => {
            console.error(`Twitch Anti-Ban: unable to fetch from ${request.url}:`, error);
            sendResponse(null);
        });
        return true;
    }

    if (request.type === 'fetchText') {
        fetch(request.url, {
            method: request.method || 'GET',
            headers: request.headers || {},
            body: request.body || null,
            credentials: sendCredentials ? 'include' : 'omit'
        })
        .then(response => response.ok ? response.text() : null)
        .then(data => sendResponse(data))
        .catch(error => {
            console.error('Twitch Anti-Ban: unable to fetch text:', error);
            sendResponse(null);
        });
        return true;
    }
});