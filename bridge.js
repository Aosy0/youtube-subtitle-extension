// YouTubeのメインワールドで実行されるブリッジスクリプト
// Trusted TypesやIsolated Worldの壁を越えてプレーヤーの内部データにアクセスします。

(function() {
    const bridge = document.createElement('div');
    bridge.id = 'yse-data-bridge';
    bridge.style.display = 'none';
    document.documentElement.appendChild(bridge);

    // 傍受した字幕データ（リスナー登録前に傍受した場合に備えて保持する）
    let interceptedSubtitle = null; // { text, url }

    // ==========================================
    // XHRインターセプト（YouTubeのtimedtextレスポンスを直接取得）
    // ==========================================
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
        const urlStr = typeof url === 'string' ? url : (url ? String(url) : '');
        if (urlStr.includes('timedtext')) {
            console.log('[YSE-BRIDGE] timedtext XHRを検出しました');
            this.addEventListener('load', function() {
                let body = null;
                try { body = this.responseText; } catch (_) {}
                console.log('[YSE-BRIDGE] timedtext XHR完了:', this.status, body?.length || 0);
                if (this.status === 200 && body) {
                    const url = this.responseURL || urlStr;
                    interceptedSubtitle = { text: body, url };
                    document.dispatchEvent(new CustomEvent('YSE_INTERCEPTED_SUBTITLE', {
                        detail: { text: body, url }
                    }));
                }
            });
        }
        return origOpen.apply(this, arguments);
    };

    // ==========================================
    // Fetchインターセプト（YouTubeのfetch型timedtextリクエストに対応）
    // ==========================================
    const origFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
        const reqUrl = (typeof input === 'string') ? input
            : (input instanceof Request ? input.url
            : (input && typeof input.url === 'string' ? input.url : ''));
        
        if (reqUrl.includes('timedtext')) {
            console.log('[YSE-BRIDGE] timedtext fetchを検出しました');
            return origFetch(input, init).then(async response => {
                console.log('[YSE-BRIDGE] timedtext fetch完了:', response.status);
                if (response.ok) {
                    const clone = response.clone();
                    try {
                        const text = await clone.text();
                        if (text) {
                            interceptedSubtitle = { text, url: reqUrl };
                            document.dispatchEvent(new CustomEvent('YSE_INTERCEPTED_SUBTITLE', {
                                detail: { text, url: reqUrl }
                            }));
                        }
                    } catch (_) {}
                }
                return response;
            });
        }
        return origFetch(input, init);
    };

    // ==========================================
    // playerResponse収集
    // ==========================================
    function updateData() {
        let playerResponse = null;
        
        const player = document.querySelector('#movie_player');
        if (player && typeof player.getPlayerResponse === 'function') {
            try { playerResponse = player.getPlayerResponse(); } catch(e){}
        }
        
        if (!playerResponse && window.ytInitialPlayerResponse) {
            playerResponse = window.ytInitialPlayerResponse;
        }
        
        if (!playerResponse && typeof ytplayer !== 'undefined' && ytplayer.config?.args?.player_response) {
            try { 
                playerResponse = typeof ytplayer.config.args.player_response === 'string' 
                    ? JSON.parse(ytplayer.config.args.player_response) 
                    : ytplayer.config.args.player_response;
            } catch(e){}
        }

        if (playerResponse) {
            const payload = {
                // 応答自身が持つvideoIdを正とする（SPA遷移中はURLと応答がずれるため）
                videoId: (playerResponse.videoDetails && playerResponse.videoDetails.videoId) ||
                    (new URLSearchParams(location.search).get('v') || (location.pathname.match(/^\/(?:shorts|live)\/([\w-]+)/) || [])[1] || null),
                captions: playerResponse.captions || null
            };
            bridge.setAttribute('data-player-response', JSON.stringify(payload));
        }
    }

    let updateInterval = setInterval(updateData, 2000);

    // URLから動画IDを取得（ブリッジ内の最小実装）
    function getVideoIdFromUrl(urlStr) {
        try {
            const u = new URL(urlStr || location.href, location.href);
            const v = u.searchParams.get('v');
            if (v) return v;
            const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/);
            return m ? m[1] : null;
        } catch (_) {
            return null;
        }
    }

    function onNavigate() {
        // 同一動画の傍受データは保持する（初回ロード直後のnavigate-finishで消さない）
        const currentVid = getVideoIdFromUrl(location.href);
        const dataVid = interceptedSubtitle ? getVideoIdFromUrl(interceptedSubtitle.url) : null;
        if (!(currentVid && dataVid && currentVid === dataVid)) {
            interceptedSubtitle = null;
        }
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(updateData, 2000);
        updateData();
    }

    window.addEventListener('yt-navigate-finish', onNavigate);
    document.addEventListener('yt-navigate-finish', onNavigate);
    window.addEventListener('load', updateData);
    setTimeout(updateData, 500);

    // ==========================================
    // 傍受済みデータの再送（リスナー登録前に傍受された場合の対策）
    // ==========================================
    document.addEventListener('YSE_GET_INTERCEPTED_SUBTITLE', () => {
        if (interceptedSubtitle && interceptedSubtitle.text) {
            document.dispatchEvent(new CustomEvent('YSE_INTERCEPTED_SUBTITLE', {
                detail: { text: interceptedSubtitle.text, url: interceptedSubtitle.url }
            }));
        }
    });

    // ==========================================
    // Fetch プロキシ（レスポンスインターセプトが効かない場合の冗長パス）
    // ==========================================
    document.addEventListener('YSE_FETCH_REQUEST', async (e) => {
        try {
            const { url, requestId } = e.detail;
            const response = await fetch(url, { credentials: 'include' });
            const text = await response.text();
            console.log('[YSE-BRIDGE] fetch proxy応答:', response.status, text?.length || 0);
            document.dispatchEvent(new CustomEvent('YSE_FETCH_RESPONSE', { 
                detail: { requestId, status: response.status, statusText: response.statusText, text }
            }));
        } catch (err) {
            document.dispatchEvent(new CustomEvent('YSE_FETCH_RESPONSE', { 
                detail: { requestId: e.detail?.requestId, error: err.toString() }
            }));
        }
    });
})();
