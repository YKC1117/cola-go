/* Run with Playwright available. Optional CHROMIUM_EXECUTABLE_PATH and QA_FONT_DIR.
 * Uses checked-in data and blocks external network requests. Does not mock live data.
 * QA_FONT_DIR may point to @fontsource/noto-sans-tc on Linux without CJK fonts.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/ui-v6/screenshots');
const results = [];
const check = (name, condition) => { assert.ok(condition, name); results.push(name); };
const types = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json','.webmanifest':'application/manifest+json'};
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://localhost');
  const file = path.resolve(root,'.'+decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data);});
});
let browser;
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
  let fontCSS='';
  if(process.env.QA_FONT_DIR){
    const dir=path.resolve(process.env.QA_FONT_DIR);
    fontCSS=fs.readFileSync(path.join(dir,'400.css'),'utf8').replace(/url\(\.\/files\/([^)]*)\)/g,(_,name)=>`url(data:font/woff2;base64,${fs.readFileSync(path.join(dir,'files',name)).toString('base64')})`);
  }
  const applyFonts=async page=>{if(fontCSS)await page.addStyleTag({content:fontCSS});await page.evaluate(()=>document.fonts.ready);};
  const errors=[];
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(()=>document.querySelectorAll('#chargingList article').length>0);
  await applyFonts(page);
  await page.evaluate(()=>{window.__opened=[];window.open=(url)=>{window.__opened.push(url);return null;};});
  const baseline=execFileSync('git',['show','9212eb9077a5576a56109fbe5a6e52ed866c0a29:index.html'],{cwd:root,encoding:'utf8'});
  const contracts=await page.evaluate(html=>{
    const old=new DOMParser().parseFromString(html,'text/html');
    const attrs=['id','data-view','data-go','data-road','data-highway','data-direction'];
    return attrs.map(attr=>({attr,missing:[...new Set([...old.querySelectorAll(`[${attr}]`)].map(el=>el.getAttribute(attr)))].filter(value=>![...document.querySelectorAll(`[${attr}]`)].some(el=>el.getAttribute(attr)===value))}));
  },baseline);
  check('Original DOM IDs, routes and filters retained',contracts.every(x=>x.missing.length===0));
  check('Public inquiry links do not expose GitHub issue forms',await page.evaluate(()=>![...document.querySelectorAll('[data-url]')].some(el=>/github\.com\/YKC1117\/cola-go\/issues\/new/.test(el.dataset.url||''))));
  check('No duplicate IDs',await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(x=>x.id);return new Set(ids).size===ids.length;}));
  check('No private route defaults or route-fill attributes',await page.evaluate(()=>!document.querySelector('[data-route],[data-fill-route]')&&!document.querySelector('#tripFrom').value&&!document.querySelector('#tripTo').value));
  await page.setViewportSize({width:390,height:844});
  await page.locator('.bottom-nav [data-go=charging]').click();
  await page.evaluate(()=>{window.__logoReloadSentinel='topbar';sessionStorage.setItem('cola-go-logo-test','stale');});
  await Promise.all([
    page.waitForNavigation({waitUntil:'domcontentloaded'}),
    page.locator('.brand[data-home-reload]').click()
  ]);
  await page.waitForFunction(()=>document.querySelector('.view.active')?.dataset.view==='home');
  check('Topbar brand returns home with a full reload',page.url().endsWith('#home')&&await page.evaluate(()=>window.__logoReloadSentinel===undefined&&sessionStorage.getItem('cola-go-logo-test')===null));

  check('Visible home hero brand is a real clickable button',await page.locator('.hero-brand[data-home-reload]').evaluate(el=>el.tagName==='BUTTON'&&getComputedStyle(el).visibility!=='hidden'));
  await page.evaluate(()=>{window.__logoReloadSentinel='hero';sessionStorage.setItem('cola-go-logo-test','stale');});
  await Promise.all([
    page.waitForNavigation({waitUntil:'domcontentloaded'}),
    page.locator('.hero-brand[data-home-reload]').click()
  ]);
  await page.waitForFunction(()=>document.querySelector('.view.active')?.dataset.view==='home');
  check('Visible home hero brand reloads home on mobile',page.url().endsWith('#home')&&await page.evaluate(()=>window.__logoReloadSentinel===undefined&&sessionStorage.getItem('cola-go-logo-test')===null));
  await applyFonts(page);
  await page.evaluate(()=>{window.__opened=[];window.open=(url)=>{window.__opened.push(url);return null;};});
  const source=fs.readFileSync(path.join(root,'index.html'),'utf8')+fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
  check('No prohibited private route strings',['東山','嘉義','台北'].every(to=>!source.includes('台南'+'|'+to)));
  const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');
  check('Legacy car/mountain/map/road drawing selectors removed',!/(\.hero-car|\.hero-mountain|\.concept-map|\.map-pin|\.v[345]-|\.tunnel-car|\.camera-road)/.test(css));
  check('Safe-area bottom inset retained',css.includes('env(safe-area-inset-bottom'));
  for(const width of [390,430,1440]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    for(const view of ['home','charging','parking','highway','tunnel','cctv']){
      if(view==='cctv')await page.locator('[data-view=highway] .cctv-link').click();
      else await page.locator(`.bottom-nav [data-go=${view}]`).click();
      await page.locator(`.view.active[data-view=${view}]`).waitFor();
      await page.evaluate(()=>document.fonts.ready);
      check(`${view} ${width}px: no horizontal overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.locator('.view.active img').evaluateAll(async imgs=>{await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});})));});
      check(`${view} ${width}px: images decoded`,await page.evaluate(()=>[...document.querySelectorAll('.view.active img')].every(x=>x.complete&&x.naturalWidth>0)));
      const nav=await page.locator('.bottom-nav').boundingBox();
      check(`${view} ${width}px: bottom nav fixed`,Math.abs(nav.y+nav.height-(width===1440?1000:844))<2);
      if(view!=='cctv')check(`${view} ${width}px: active navigation`,await page.locator(`.bottom-nav [data-go=${view}]`).getAttribute('aria-current')==='page');
      await page.screenshot({path:path.join(output,`${view}-${width}.png`)});
      if(view==='home'&&width===390)await page.screenshot({path:path.join(output,'home-390-full.png'),fullPage:true});
      // CCTV is a child route reached from the highway section.
      if(view==='tunnel')await page.locator('.bottom-nav [data-go=highway]').click();
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('.bottom-nav [data-go=home]').click();
  check('LINE report link uses supplied destination',await page.locator('.support-line a').getAttribute('href')==='https://lin.ee/Tu89Qyk');
  await page.locator('.search-destination').click();
  check('Destination search opens route form',await page.locator('[data-view=trip]').isVisible());
  await page.locator('#tripTo').fill('臺中車站');
  await page.locator('#planTripBtn').click();
  await page.locator('#tripResult [data-map=google]').click();
  check('Route navigation uses entered destination, no preset origin',await page.evaluate(()=>{const u=new URL(window.__opened.at(-1));return u.searchParams.get('destination')==='臺中車站'&&!u.searchParams.has('origin');}));
  check('Direct navigation options stay focused on Google and Apple',await page.locator('#tripResult [data-map]').evaluateAll(nodes=>nodes.map(n=>n.dataset.map).sort().join(',')==='apple,google'));
  await page.locator('.bottom-nav [data-go=charging]').click();
  await page.waitForFunction(()=>state.charging.some(x=>x.road==='tdx'));
  const all=await page.locator('#chargingList article').count();
  check('Charging mobile-first controls are visible',await page.locator('#chargingNearby').isVisible()&&await page.locator('#chargingQuickFilter').isVisible()&&await page.locator('#chargingSearch').isVisible());
  check('Charging source HTML formatting becomes readable text',await page.evaluate(()=>chargingDisplayText('尖峰<br>12.7元&nbsp;每度')==='尖峰 · 12.7元 每度'));

  await page.locator('[data-charge-quick="available"]').click();
  check('Available-now quick filter updates state',await page.evaluate(()=>state.chargingQuick==='available'));
  check('Available-now filter decodes current TDX liveStates safely',await page.evaluate(()=>state.chargingQuick==='available'&&state.charging.filter(chargingQuickMatch).every(x=>x.road==='tdx'&&!x.liveStale&&chargingLiveCounts(x).available>0))&&((await page.locator('#chargingList article').count()>0)||((await page.locator('#chargingList .empty').textContent()).includes('即時空槍'))));
  await page.locator('[data-charge-quick="fast"]').click();
  check('100 kW quick filter only includes verified 100 kW+ rows',await page.evaluate(()=>state.charging.filter(chargingQuickMatch).every(x=>chargingPowerKw(x)>=100)));
  await page.locator('[data-charge-quick="all"]').click();

  await page.locator('.charging-advanced > summary').click();
  await page.locator('#chargingCity').selectOption('Tainan');
  check('Charging city selector filters actual TDX cards',await page.locator('#chargingList article').count()>0&&await page.evaluate(()=>state.chargingCity==='Tainan'&&[...document.querySelectorAll('#chargingList article')].every(el=>el.textContent.includes('臺南市'))));
  await page.locator('#chargingCity').selectOption('all');
  await page.locator('#roadFilter [data-road="3"]').click();
  const filtered=await page.locator('#chargingList article').count();
  check('Charging road filter changes actual results',filtered>0&&filtered<all);
  await page.locator('#chargingConnector').selectOption('CCS2');
  check('Connector filter decodes legacy numeric TDX connector types',await page.locator('#chargingList article').count()>0&&await page.evaluate(()=>state.chargingConnector==='CCS2'));
  await page.locator('#resetChargingFilters').click();

  await page.locator('#chargingSearch').fill('NO_MATCH_UI_TEST');
  check('Charging search empty state',await page.locator('#chargingList article').count()===0);
  await page.locator('#resetChargingFilters').click();

  await page.locator('#chargingList .favorite-btn').first().click();
  await page.locator('#chargingFavoritesOnly').click();
  check('Charging favorites persist and filter',await page.locator('#chargingList article').count()===1 && await page.evaluate(()=>JSON.parse(localStorage.getItem('cola-go-charging-favorites')||'[]').length===1));
  await page.locator('#resetChargingFilters').click();

  await context.grantPermissions(['geolocation'],{origin:base});
  await context.setGeolocation({latitude:22.993,longitude:120.214});
  await page.locator('#chargingNearby').click();
  await page.waitForFunction(()=>state.chargingSort==='nearby'&&Boolean(state.chargingOrigin));
  check('Nearby charging uses geolocation only after explicit tap',await page.evaluate(()=>state.chargingSort==='nearby'&&Math.abs(state.chargingOrigin.lat-22.993)<0.001));
  check('Nearby charging renders distance when coordinates exist',await page.locator('#chargingList .specs').first().textContent().then(x=>x.includes('km')));
  await page.locator('#chargingNearby').click();
  check('Nearby charging can return to smart sorting',await page.evaluate(()=>state.chargingSort==='smart'&&state.chargingOrigin===null));

  await page.locator('#chargingList [data-charge-google]').first().click();
  check('Charging card Google action opens driving directions',await page.evaluate(()=>window.__opened.at(-1).startsWith('https://www.google.com/maps/dir/?api=1&destination=')));
  await page.locator('#nearbyGoogle').click();
  check('Generic nearby charging search remains available',await page.evaluate(()=>window.__opened.at(-1).startsWith('https://www.google.com/maps/search/')));
  await page.locator('.bottom-nav [data-go=parking]').click();
  await page.locator('#parkingCitySelect').selectOption('Tainan');
  check('Parking city selector updates scope',await page.locator('#parkingScopeTitle').textContent()==='臺南市');
  await page.locator('#parkingNearbyApple').click();
  check('Nearby parking opens Apple Maps',await page.evaluate(()=>window.__opened.at(-1).startsWith('https://maps.apple.com/')));
  await page.locator('.bottom-nav [data-go=highway]').click();
  await page.locator('#highwayTabs [data-highway="3"]').click();
  check('Highway chips update selected road',await page.evaluate(()=>state.highway==='3'));
  await page.locator('[data-view=highway] .cctv-link').click();
  await page.locator('#cctvRoadFilter button').last().click();
  check('CCTV filter handler remains wired',await page.evaluate(()=>state.cctvRoad===document.querySelector('#cctvRoadFilter button:last-child').dataset.cctvRoad));
  await page.locator('.bottom-nav [data-go=tunnel]').click();
  await page.locator('#tunnelDirection [data-direction=north]').click();
  check('Snow tunnel direction changes',await page.evaluate(()=>state.direction==='north'));
  const checkedInTunnel=JSON.parse(fs.readFileSync(path.join(root,'data/tdx/tunnel.json'),'utf8'));
  const checkedInNorth=Array.isArray(checkedInTunnel.north)?checkedInTunnel.north.length:0;
  if(checkedInNorth){
    await page.waitForFunction(()=>['live','stale'].includes(state.tunnel?.status)&&document.querySelectorAll('#tunnelList .metric').length>0);
    check('Checked-in TDX tunnel cache renders official speed rows',await page.locator('#tunnelList .metric').count()>0&&await page.evaluate(()=>['live','stale'].includes(state.tunnel?.status)));
    const checkedInStamp=Date.parse(checkedInTunnel.liveUpdatedAt||checkedInTunnel.updatedAt||'');
    const expectedTunnelStatus=Number.isFinite(checkedInStamp)&&Date.now()-checkedInStamp<=45*60*1000?'live':'stale';
    check('TDX tunnel freshness label matches snapshot age',await page.evaluate(expected=>state.tunnel?.status===expected,expectedTunnelStatus));
  }else{
    check('Missing tunnel feed renders unavailable without speed numbers',await page.locator('#tunnelList .metric').count()===0 && (await page.locator('#tunnelList').textContent()).includes('沒有資料'));
  }
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:900});
    const views=await page.locator('.view').evaluateAll(xs=>xs.map(x=>x.dataset.view));
    for(const view of views){await page.evaluate(v=>show(v),view);check(`All-view layout ${view} ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  }
  await page.evaluate(()=>show('nonexistent'));
  check('Unknown route recovers to home',await page.locator('[data-view=home]').isVisible());
  await page.locator('#installBtn').click();
  check('PWA installation help is available',await page.locator('#toast').textContent().then(x=>x.includes('主畫面')||x.includes('安裝')));
  await page.evaluate(()=>show('shortcuts'));
  for(const width of [390,430,1440]){
    await page.setViewportSize({width,height:900});
    for(const img of await page.locator('.shortcut-guide img').all()){
      await img.scrollIntoViewIfNeeded(); await img.evaluate(i=>i.decode());
      const src=await img.getAttribute('src'); const response=await context.request.get(base+'/'+src);
      check(`Guide ${src} ${width}px HTTP/MIME`,response.status()===200&&response.headers()['content-type']==='image/jpeg');
      check(`Guide ${src} ${width}px full ratio`,await img.evaluate(i=>Math.abs(i.clientWidth/i.clientHeight-i.naturalWidth/i.naturalHeight)<0.005&&getComputedStyle(i).objectFit==='contain'));
      check(`Guide ${src} opens full image`,await img.evaluate(i=>i.parentElement.href===i.src&&i.parentElement.target==='_blank'));
    }
    check(`Guides ${width}px no overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(output,`shortcuts-${width}.png`),fullPage:true});
  }
  const guidePopupPromise=context.waitForEvent('page');
  await page.locator('.shortcut-guide a').first().click();
  const guidePopup=await guidePopupPromise; await guidePopup.waitForLoadState();
  check('Guide click opens full-size image',guidePopup.url().endsWith('/assets/images/carkit-ios27-overview.jpg'));
  await guidePopup.close();
  check('iCloud download URLs unchanged',JSON.stringify(await page.locator('.shortcut-download').evaluateAll(a=>a.map(x=>x.href)))===JSON.stringify(['https://www.icloud.com/shortcuts/fc68c6a436e347408b342607b4e0b377','https://www.icloud.com/shortcuts/87aad0f93e5e473ba01401f4e80fd43e']));
  check('Tesla real-car report copy button is visible',await page.locator('#copyTeslaReportBtn').isVisible());
  check('Oil validation status is explicit',await page.locator('.shortcut-card').filter({hasText:'油車助手'}).locator('.shortcut-proof').textContent().then(x=>x.includes('已驗證：捷徑安裝、主選單、導航基本流程')&&x.includes('待實車：CarPlay／Bluetooth 上車自動觸發、不同品牌車機相容性')));
  check('Tesla validation status is explicit',await page.locator('.shortcut-card').filter({hasText:'特斯拉助手'}).locator('.shortcut-proof').textContent().then(x=>x.includes('已驗證：捷徑安裝、主選單、語音入口')&&x.includes('待驗證：Tesla Bluetooth 自動觸發／實車遠端控制')));
  check('iOS 27 direct automation setup is explicit',await page.locator('.shortcut-automation').filter({hasText:'上車自動啟動｜只要設定一次'}).textContent().then(x=>x.includes('編輯')&&x.includes('自動化操作')&&x.includes('CarPlay')&&x.includes('Bluetooth')&&x.includes('允許鎖定時執行')&&!x.includes('動作選「執行捷徑」')));
  check('Oil setup deep link targets installed shortcut',await page.locator('.shortcut-card').filter({hasText:'油車助手'}).locator('.shortcut-setup-link').getAttribute('href').then(x=>x==='shortcuts://open-shortcut?name=%E6%B2%B9%E8%BB%8A%E5%8A%A9%E6%89%8B'));
  check('Tesla setup deep link targets installed shortcut',await page.locator('.shortcut-card').filter({hasText:'特斯拉助手'}).locator('.shortcut-setup-link').getAttribute('href').then(x=>x==='shortcuts://open-shortcut?name=%E7%89%B9%E6%96%AF%E6%8B%89%E5%8A%A9%E6%89%8B'));
  check('Tesla report template contains required fields',(await page.locator('#teslaReportTemplate').textContent()).includes('iPhone 型號：')&&(await page.locator('#teslaReportTemplate').textContent()).includes('Siri「特斯拉助手」：'));
  await page.locator('#copyTeslaReportBtn').click();
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('已複製 Tesla 實車回報格式'));
  check('Tesla report copy feedback appears',await page.locator('#toast').textContent().then(x=>x.includes('已複製 Tesla 實車回報格式')));
  await page.evaluate(()=>navigator.serviceWorker.ready);
  const cached=await page.evaluate(async()=>{const cache=await caches.open('cola-go-ui-v6-21');return (await cache.keys()).map(x=>new URL(x.url).pathname);});
  check('PWA caches all five local visual assets',['drive-hero','tunnel','trip-road','trip-parking','trip-charging'].every(name=>cached.includes(`/assets/images/${name}.webp`)));
  check('TDX official cache is network-only in service worker',fs.readFileSync(path.join(root,'sw.js'),'utf8').includes('u.pathname.includes("/data/tdx/")')&&!cached.some(pathname=>pathname.includes('/data/tdx/')));
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(()=>document.querySelectorAll('#chargingList article').length>0);
  check('Offline reload retains app and charging dataset',await page.locator('#chargingList article').count()===all);
  check('Offline hero loads from cache',await page.locator('.hero-photo').evaluate(x=>x.complete&&x.naturalWidth>0));
  check('No uncaught browser JavaScript errors',errors.length===0);
  const report={browser:browser.version(),viewports:[390,430,1440],checks:results.length,passed:results,errors,externalNetwork:'blocked; checked-in data only, no fabricated feeds',fontSetup:fontCSS?'QA-only embedded Noto Sans TC; product CSS unchanged':'system fonts'};
  fs.writeFileSync(path.join(root,'docs/ui-v6/verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`PASS ${results.length} checks; screenshots: ${output}`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});