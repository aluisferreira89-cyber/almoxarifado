function sanitizeText(value, maxLen = 500) {
    const str = String(value ?? "").slice(0, maxLen);
    return str.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

function sanitizeAlnum(value, maxLen = 50) {
    return sanitizeText(value, maxLen).replace(/[^a-zA-Z0-9À-ÿ _.-]/g, "");
}

function canRunAction(actionKey, limit = 5, windowMs = 5000) {
    if (!window.__rateMap) window.__rateMap = new Map();
    const now = Date.now();
    const item = window.__rateMap.get(actionKey) || { count: 0, start: now };

    if (now - item.start > windowMs) {
        window.__rateMap.set(actionKey, { count: 1, start: now });
        return true;
    }

    if (item.count >= limit) return false;
    item.count += 1;
    window.__rateMap.set(actionKey, item);
    return true;
}

function debounce(fn, wait = 250) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

async function safeFetch(url, options = {}, cfg = {}) {
    const { timeoutMs = 10000, retries = 1, retryDelayMs = 600 } = cfg;

    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const resp = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return resp;
        } catch (err) {
            clearTimeout(timer);
            if (attempt >= retries) throw err;
            await new Promise(r => setTimeout(r, retryDelayMs * (attempt + 1)));
        }
    }
}