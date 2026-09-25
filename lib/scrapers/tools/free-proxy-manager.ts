const FREE_PROXY_SOURCES = [
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
  'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
  'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
  'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt',
  'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=us',
];

let proxyPool: string[] = [];
let lastRefresh = 0;

export async function getWorkingProxy(): Promise<string> {
  // Refresh proxy list every 10 minutes
  if (Date.now() - lastRefresh > 600000) {
    await refreshProxyPool();
  }
  
  // Return random proxy from pool
  const proxy = proxyPool[Math.floor(Math.random() * proxyPool.length)];
  return proxy || '';
}

async function refreshProxyPool() {
  const allProxies: string[] = [];
  
  for (const source of FREE_PROXY_SOURCES) {
    try {
      const res = await fetch(source, { signal: AbortSignal.timeout(5000) });
      const text = await res.text();
      const proxies = text.split('\n')
        .map(p => p.trim())
        .filter(p => p.match(/^\d+\.\d+\.\d+\.\d+:\d+$/));
      allProxies.push(...proxies);
    } catch {}
  }
  
  // Test proxies and keep working ones
  // Run in parallel, test with fast timeout
  const working = await Promise.allSettled(
    allProxies.slice(0, 100).map(async (proxy) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        await fetch('http://httpbin.org/ip', {
          signal: controller.signal,
          // @ts-expect-error Node fetch supports proxy in some runtimes
          proxy: `http://${proxy}`,
        });
        return proxy;
      } finally {
        clearTimeout(timeout);
      }
    })
  );
  
  proxyPool = working
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<string>).value);
    
  lastRefresh = Date.now();
  console.log(`[Proxy] Pool refreshed: ${proxyPool.length} working proxies`);
}
