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
const types = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.json':'application/json','.webmanifest':'application/manifest+json'};
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
    const attrs=['id','data-view','data-go','data-road','data-highway','data-direction','data-url'];
    return attrs.map(attr=>({attr,missing:[...new Set([...old.querySelectorAll(`[${attr}]`)].map(el=>el.getAttribute(attr)))].filter(value=>![...document.querySelectorAll(`[${attr}]`)].some(el=>el.getAttribute(attr)===value))}));
  },baseline);
  check('Original DOM IDs, routes, filters and external links retained',contracts.every(x=>x.missing.length===0));
  check('No duplicate IDs',await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(x=>x.id);return new Set(ids).size===ids.length;}));
  check('No private route defaults or route-fill attributes',await page.evaluate(()=>!document.querySelector('[data-route],[data-fill-route]')&&!document.querySelector('#tripFrom').value&&!document.querySelector('#tripTo').value));
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
  await page.locator('.bottom-nav [data-go=charging]').click();
  const all=await page.locator('#chargingList article').count();
  await page.locator('#roadFilter [data-road="3"]').click();
  const filtered=await page.locator('#chargingList article').count();
  check('Charging road filter changes actual results',filtered>0&&filtered<all);
  await page.locator('[data-view=charging] summary').click();
  await page.locator('#chargingConnector').selectOption('CCS2');
  check('Connector filter retained',await page.evaluate(()=>state.chargingConnector==='CCS2'));
  await page.locator('#resetChargingFilters').click();
  await page.locator('#chargingSearch').fill('NO_MATCH_UI_TEST');
  check('Charging search empty state',await page.locator('#chargingList article').count()===0);
  await page.locator('#resetChargingFilters').click();
  await page.locator('#chargingList .favorite-btn').first().click();
  await page.locator('#chargingFavoritesOnly').click();
  check('Charging favorites persist and filter',await page.locator('#chargingList article').count()===1 && await page.evaluate(()=>JSON.parse(localStorage.getItem('cola-go-charging-favorites')||'[]').length===1));
  await page.locator('#resetChargingFilters').click();
  await page.locator('#nearbyGoogle').click();
  check('Nearby charging opens real map service',await page.evaluate(()=>window.__opened.at(-1).startsWith('https://www.google.com/maps/search/')));
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
  check('Missing tunnel feed renders unavailable without speed numbers',await page.locator('#tunnelList .metric').count()===0 && (await page.locator('#tunnelList').textContent()).includes('沒有資料'));
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:900});
    const views=await page.locator('.view').evaluateAll(xs=>xs.map(x=>x.dataset.view));
    for(const view of views){await page.evaluate(v=>show(v),view);check(`All-view layout ${view} ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  }
  await page.evaluate(()=>show('nonexistent'));
  check('Unknown route recovers to home',await page.locator('[data-view=home]').isVisible());
  await page.locator('#installBtn').click();
  check('PWA installation help is available',await page.locator('#toast').textContent().then(x=>x.includes('主畫面')||x.includes('安裝')));
  await page.evaluate(()=>navigator.serviceWorker.ready);
  const cached=await page.evaluate(async()=>{const cache=await caches.open('cola-go-ui-v6-1');return (await cache.keys()).map(x=>new URL(x.url).pathname);});
  check('PWA caches all five local visual assets',['drive-hero','tunnel','trip-road','trip-parking','trip-charging'].every(name=>cached.includes(`/assets/images/${name}.webp`)));
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