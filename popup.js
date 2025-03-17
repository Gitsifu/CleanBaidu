document.addEventListener('DOMContentLoaded', function() {
    const toggle = document.getElementById('adBlockToggle');
    const statusText = document.getElementById('statusText');
    const adCount = document.getElementById('adCount');
    const adList = document.getElementById('adList');
    const refreshStats = document.getElementById('refreshStats');

    // 处理URL，提取目标域名
    function formatUrl(url) {
        try {
            // 处理百度跳转链接
            if (url.includes('baidu.com/baidu.php')) {
                const params = new URLSearchParams(url.split('?')[1]);
                const shhParam = params.get('shh');
                if (shhParam) {
                    return shhParam;
                }
            }
            
            // 处理普通URL
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (e) {
            // 如果URL解析失败，返回原始URL的前30个字符
            return url.substring(0, 30) + '...';
        }
    }

    // 更新广告列表显示
    function updateAdList(stats) {
        adCount.textContent = stats.count;
        
        if (stats.count === 0) {
            adList.innerHTML = '<div class="no-ads">暂无广告被屏蔽</div>';
            return;
        }

        adList.innerHTML = stats.items.map((item, index) => `
            <div class="ad-item">
                <div class="ad-header">
                    <span class="ad-type">[${item.type}]</span>
                    <span class="ad-location">${item.location}</span>
                    <span class="ad-number">#${index + 1}</span>
                </div>
                ${item.title ? `<div class="ad-title">${item.title}</div>` : ''}
                ${item.description ? `<div class="ad-description">${item.description}</div>` : ''}
                ${item.url ? `<div class="ad-url">${formatUrl(item.url)}</div>` : ''}
            </div>
        `).join('');
    }

    // 获取当前标签页的广告统计
    function fetchAdStats() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs && tabs[0] && tabs[0].url && tabs[0].url.includes('baidu.com')) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'getAdStats'
                }, function(response) {
                    if (!chrome.runtime.lastError && response) {
                        updateAdList(response);
                    } else {
                        updateAdList({ count: 0, items: [] });
                    }
                });
            } else {
                updateAdList({ count: 0, items: [] });
                adList.innerHTML = '<div class="no-ads">请访问百度搜索页面</div>';
            }
        });
    }

    // 加载保存的状态
    chrome.storage.sync.get(['enabled'], function(result) {
        toggle.checked = result.enabled === undefined ? true : result.enabled;
        updateStatusText(toggle.checked);
        fetchAdStats();
    });

    // 监听开关变化
    toggle.addEventListener('change', function() {
        const enabled = toggle.checked;
        
        // 保存状态
        chrome.storage.sync.set({ enabled: enabled }, function() {
            // 确保状态保存成功后再更新UI
            updateStatusText(enabled);
            
            // 通知content script
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs && tabs[0] && tabs[0].url && tabs[0].url.includes('baidu.com')) {
                    try {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'toggleAdBlock',
                            enabled: enabled
                        }, function(response) {
                            if (chrome.runtime.lastError) {
                                console.log('消息发送失败:', chrome.runtime.lastError);
                                // 如果发送失败，重新加载页面以确保状态同步
                                chrome.tabs.reload(tabs[0].id);
                            }
                            // 更新广告统计
                            fetchAdStats();
                        });
                    } catch (error) {
                        console.log('发送消息时出错:', error);
                        // 出错时重新加载页面
                        chrome.tabs.reload(tabs[0].id);
                    }
                }
            });
        });
    });

    // 监听刷新按钮点击
    refreshStats.addEventListener('click', fetchAdStats);

    // 监听来自content script的广告统计更新
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === 'updateAdStats') {
            updateAdList(request.data);
        }
    });
});

function updateStatusText(enabled) {
    const statusText = document.getElementById('statusText');
    statusText.textContent = enabled ? '已启用' : '已禁用';
    statusText.style.color = enabled ? '#2196F3' : '#666';
} 