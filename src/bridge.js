// YouTubeのメインワールドで実行されるブリッジスクリプト
// Trusted TypesやIsolated Worldの壁を越えてプレーヤーの内部データにアクセスします。

(function() {
    const bridge = document.createElement('div');
    bridge.id = 'yse-data-bridge';
    bridge.style.display = 'none';
    document.documentElement.appendChild(bridge);

    function updateData() {
        let playerResponse = null;
        
        // 1. YouTubeプレーヤーから直接取得
        const player = document.querySelector('#movie_player');
        if (player && typeof player.getPlayerResponse === 'function') {
            try { playerResponse = player.getPlayerResponse(); } catch(e){}
        }
        
        // 2. グローバル変数からの取得
        if (!playerResponse && window.ytInitialPlayerResponse) {
            playerResponse = window.ytInitialPlayerResponse;
        }
        
        // 3. その他ytplayerからの取得
        if (!playerResponse && typeof ytplayer !== 'undefined' && ytplayer.config?.args?.player_response) {
            try { 
                playerResponse = typeof ytplayer.config.args.player_response === 'string' 
                    ? JSON.parse(ytplayer.config.args.player_response) 
                    : ytplayer.config.args.player_response;
            } catch(e){}
        }

        if (playerResponse) {
            // パフォーマンスのため、大量の動画データを含む全体ではなく captions のみを渡す
            const payload = {
                captions: playerResponse.captions || null
            };
            bridge.setAttribute('data-player-response', JSON.stringify(payload));
        }
    }

    // イベントフックと定期ポーリング
    window.addEventListener('yt-navigate-finish', updateData);
    window.addEventListener('load', updateData);
    setInterval(updateData, 2000);
    setTimeout(updateData, 500);

    // ==========================================
    // Fetch プロキシ機能（MAINワールドのネットワーク文脈を利用）
    // ==========================================
    window.addEventListener('YSE_FETCH_REQUEST', async (e) => {
        try {
            let { url, requestId } = e.detail;
            
            // PoT (Proof of Token) の検索と付加
            if (url.includes('timedtext') && !url.includes('&pot=')) {
                let pot = null;
                
                // 1. ytcfgから検索
                if (typeof ytcfg !== 'undefined' && ytcfg.get) {
                    pot = ytcfg.get('PO_TOKEN') || 
                          ytcfg.get('INNERTUBE_CONTEXT')?.client?.poToken ||
                          ytcfg.get('WEB_PLAYER_CONTEXT_CONFIGS')?.activePoToken;
                }
                
                // 2. ytInitialPlayerResponseの各階層から検索
                if (!pot && window.ytInitialPlayerResponse) {
                    const pr = window.ytInitialPlayerResponse;
                    pot = pr.playerConfig?.apiContext?.webPlayerContextConfig?.activePoToken ||
                          pr.playerConfig?.apiContext?.webPlayerContextConfig?.jsPlayerContextConfig?.poToken;
                }
                
                // 3. プレーヤーConfigから検索
                if (!pot) {
                    const player = document.querySelector('#movie_player');
                    if (player && typeof player.getConfig === 'function') {
                        const cfg = player.getConfig();
                        pot = cfg?.args?.po_token || cfg?.args?.pot;
                    }
                }

                if (pot) {
                    url += `&pot=${encodeURIComponent(pot)}`;
                    console.log('[YSE-BRIDGE] PoTトークンを付加しました:', pot.substring(0, 15) + '...');
                } else {
                    console.warn('[YSE-BRIDGE] PoTトークンが見つかりません。リクエストが拒否される可能性があります。');
                }
            }
            
            const response = await fetch(url, { credentials: 'include' });
            const text = await response.text();
            
            window.dispatchEvent(new CustomEvent('YSE_FETCH_RESPONSE', { 
                detail: { 
                    requestId,
                    status: response.status,
                    statusText: response.statusText,
                    text: text
                } 
            }));
        } catch (err) {
            window.dispatchEvent(new CustomEvent('YSE_FETCH_RESPONSE', { 
                detail: { 
                    requestId: e.detail?.requestId,
                    error: err.toString()
                } 
            }));
        }
    });

})();
