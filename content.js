// 存储广告屏蔽状态
let isEnabled = true;

// 存储被隐藏的元素
let hiddenElements = new Set();

// 存储广告信息
let adInfo = {
    count: 0,
    items: []
};

// 更新广告统计信息
function updateAdStats() {
    if (!isEnabled) return;
    chrome.runtime.sendMessage({
        action: 'updateAdStats',
        data: adInfo
    });
}

// 移除百度搜索结果中的广告
function removeBaiduAds() {
    if (!isEnabled) return;

    // 重置广告信息
    adInfo = {
        count: 0,
        items: []
    };

    // 用于防止重复统计的Set
    const processedElements = new Set();

    // 查找所有广告元素
    const findAdElements = () => {
        // 查找包含商业推广文本的元素和带有data-tuiguang属性的元素
        const xpathQuery = `
            //text()[contains(., '商业推广')] |
            //*[@data-tuiguang] |
            //span[contains(@class, 'ec-tuiguang')] |
            //span[contains(@class, 'ecfc-tuiguang')] |
            //a[@data-landurl and contains(text(), '广告')] |
            //a[contains(@class, 'm') and contains(text(), '广告')]
        `;
        
        const elements = document.evaluate(
            xpathQuery,
            document,
            null,
            XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
            null
        );

        for (let i = 0; i < elements.snapshotLength; i++) {
            let element = elements.snapshotItem(i);
            let currentNode = element.nodeType === Node.TEXT_NODE ? element.parentNode : element;
            let adElement = null;

            // 向上遍历直到找到广告容器
            while (currentNode && currentNode.parentNode) {
                if (currentNode.parentNode.id === 'content_left') {
                    // 如果直接父元素是content_left，当前节点就是广告容器
                    adElement = currentNode;
                    break;
                } else if (currentNode.id === 'content_left') {
                    // 如果当前节点是content_left，停止遍历
                    break;
                }
                currentNode = currentNode.parentNode;
                if (currentNode && currentNode.id !== 'content_left') {
                    adElement = currentNode;
                }
            }

            // 如果找到了广告元素且未处理过
            if (adElement && !processedElements.has(adElement)) {
                processedElements.add(adElement);
                hideElement(adElement);
                collectAdInfo(adElement);
            }
        }
    };

    // 执行广告移除
    findAdElements();

    // 额外的广告选择器（保留一些关键的选择器作为备份）
    const adSelectors = [
        '.ec-pl-container',     // 品牌广告容器
        '#content_right [data-placeid]', // 右侧广告
        'a[data-landurl]'       // 带有跳转URL的广告链接
    ];

    // 处理其他广告元素
    const elements = document.querySelectorAll(adSelectors.join(','));
    elements.forEach(element => {
        if (!element.closest('#content_left') && !processedElements.has(element)) {
            processedElements.add(element);
            hideElement(element);
            collectAdInfo(element);
        }
    });

    // 更新广告统计
    updateAdStats();
}

// 收集广告信息
function collectAdInfo(element) {
    if (!isEnabled) return;
    
    let adText = '';
    let adUrl = '';
    let adTitle = '';
    let adDescription = '';

    try {
        // 尝试获取广告完整信息
        if (element.tagName === 'A') {
            adText = element.textContent.trim();
            adUrl = element.href || element.getAttribute('data-landurl') || '';
        } else {
            // 尝试获取所有文本内容
            const allText = element.textContent.trim();
            
            // 尝试获取链接
            const links = element.querySelectorAll('a');
            if (links.length > 0) {
                // 获取第一个链接作为主要URL
                adUrl = links[0].href || links[0].getAttribute('data-landurl') || '';
                
                // 收集所有链接文本
                const linkTexts = Array.from(links).map(link => link.textContent.trim()).filter(Boolean);
                if (linkTexts.length > 0) {
                    adTitle = linkTexts[0]; // 第一个链接通常是标题
                }
            }
            
            // 获取描述文本（排除链接文本后的其他文本）
            const clone = element.cloneNode(true);
            Array.from(clone.querySelectorAll('a')).forEach(a => a.remove());
            adDescription = clone.textContent.trim();
            
            // 如果没有分离出标题和描述，就使用完整文本
            if (!adTitle && !adDescription) {
                adText = allText;
            }
        }

        // 只添加有效的广告信息
        if (adText || adTitle || adDescription) {
            // 生成唯一标识，用于去重
            const adIdentifier = `${adTitle || adText}|${adUrl}`;
            
            // 检查是否已经添加过相同的广告
            const isDuplicate = adInfo.items.some(item => 
                `${item.title}|${item.url}` === adIdentifier
            );

            if (!isDuplicate) {
                adInfo.items.push({
                    title: adTitle || adText,
                    description: adDescription || '',
                    url: adUrl,
                    fullText: adText || `${adTitle} ${adDescription}`.trim(),
                    type: element.getAttribute('data-tuiguang') ? '商业推广' : '广告',
                    location: element.closest('#content_right') ? '右侧' : '主列表'
                });
                adInfo.count++;
            }
        }
    } catch (error) {
        console.error('收集广告信息时出错:', error);
    }
}

// 隐藏元素并记录
function hideElement(element) {
    if (!isEnabled) return;
    
    if (element && element.style) {
        // 保存原始display值
        const originalDisplay = element.style.display;
        element.setAttribute('data-original-display', originalDisplay || '');
        element.style.display = 'none';
        hiddenElements.add(element);
    }
}

// 显示所有广告
function showAllAds() {
    hiddenElements.forEach(element => {
        if (element && element.style) {
            // 恢复原始display值
            const originalDisplay = element.getAttribute('data-original-display');
            element.style.display = originalDisplay || '';
            element.removeAttribute('data-original-display');
            
            // 移除可能存在的内联样式
            element.style.removeProperty('display');
            element.style.removeProperty('visibility');
            
            // 移除可能添加的隐藏类
            element.classList.remove('clean-baidu-hidden');
        }
    });
    hiddenElements.clear();
    
    // 重置广告信息
    adInfo = {
        count: 0,
        items: []
    };
    updateAdStats();
}

// 创建一个观察器来处理动态加载的内容
const observer = new MutationObserver((mutations) => {
    if (isEnabled) {
        removeBaiduAds();
    }
});

// 配置观察器
let observerStarted = false;

// 启动观察器
function startObserver() {
    if (!observerStarted) {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true
        });
        observerStarted = true;
    }
}

// 停止观察器
function stopObserver() {
    if (observerStarted) {
        observer.disconnect();
        observerStarted = false;
    }
}

// 加载保存的状态
chrome.storage.sync.get(['enabled'], function(result) {
    isEnabled = result.enabled === undefined ? true : result.enabled;
    if (isEnabled) {
        startObserver();
        removeBaiduAds();
    }
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'toggleAdBlock') {
        isEnabled = request.enabled;
        if (isEnabled) {
            startObserver();
            document.body.setAttribute('data-clean-baidu-enabled', 'true');
            removeBaiduAds();
        } else {
            stopObserver();
            document.body.setAttribute('data-clean-baidu-enabled', 'false');
            showAllAds();
        }
        // 发送响应表示成功接收
        sendResponse({ success: true });
    } else if (request.action === 'getAdStats') {
        // 响应获取广告统计信息的请求
        sendResponse(adInfo);
    }
    return true; // 保持消息通道开放
});

// 页面加载完成后执行
window.addEventListener('load', () => {
    // 设置初始状态
    document.body.setAttribute('data-clean-baidu-enabled', isEnabled ? 'true' : 'false');
    
    if (isEnabled) {
        startObserver();
        removeBaiduAds();
    }
}); 