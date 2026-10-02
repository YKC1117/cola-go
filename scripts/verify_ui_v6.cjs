/* Run with Playwright available. Optional CHROMIUM_EXECUTABLE_PATH and QA_FONT_DIR.
 * Uses checked-in data and blocks external network requests. Does not mock live data.
 * QA_FONT_DIR may point to @fontsource/noto-sans-tc on Linux without CJK fonts.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
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
  await context.addInitScript(()=>{
    const qaOfflineMode=sessionStorage.getItem('cola-go-ui-v6-qa-offline')==='on';
    const fixture={
      schema:1,source:'U-POWER 官方網站',updatedAt:new Date().toISOString(),count:2,totalSeats:12,
      items:[
        {id:'official-upower-dup',road:'operator',city:'Taichung',cityName:'臺中市',name:'臺中 北屯軍福站',location:'臺中市北屯區軍福十三路 270 號',operator:'旭電馳科研',operatorId:'83235398',operatorWebURL:'https://www.u-power.com.tw/',officialSupplemental:true,sitePowerKw:360,maxPowerKw:null,power:'',spaces:4,connectorCount:4,connectors:['CCS1','CCS2'],ccs1Seats:2,ccs2Seats:2,liveStateCount:0,availableConnectors:0,liveStatusKnown:false,lat:null,lon:null,direction:''},
        {id:'official-upower-extra',road:'operator',city:'Tainan',cityName:'臺南市',name:'臺南 測試官方補站',location:'臺南市東區測試路 1 號',operator:'旭電馳科研',operatorId:'83235398',operatorWebURL:'https://www.u-power.com.tw/',officialSupplemental:true,sitePowerKw:720,maxPowerKw:null,power:'',spaces:8,connectorCount:8,connectors:['CCS1','CCS2'],ccs1Seats:4,ccs2Seats:4,liveStateCount:0,availableConnectors:0,liveStatusKnown:false,lat:null,lon:null,direction:''}
      ]
    };
    const nativeFetch=window.fetch.bind(window);
    window.fetch=(input,init)=>{
      const url=typeof input==='string'?input:(input?.url||'');
      if(qaOfflineMode&&(String(url).includes('/data/tdx/')||String(url).includes('/data/operators/'))){
        return Promise.reject(new TypeError('QA offline live feed disabled'));
      }
      if(qaOfflineMode)return nativeFetch(input,init);
      if(String(url).includes('/data/tdx/charging.json')||String(url).includes('./data/tdx/charging.json')){
        return nativeFetch(input,init).then(async response=>{
          const data=await response.clone().json();
          data.items=[...(data.items||[]),
            {id:'tdx-dedupe-name',road:'tdx',city:'Tainan',cityName:'臺南市',name:'Times_台南測試停車場',location:'台南市東區測試路88號',operator:'華城電能科技股份有限公司',operatorId:'90807408',networkKey:'evalue',spaces:2,connectorCount:2,connectors:['CCS2'],maxPowerKw:180,power:'180 kW',liveStateCount:2,availableConnectors:1,occupiedConnectors:1,faultedConnectors:0,unavailableConnectors:0,unknownConnectors:0,liveStates:{'1':1,'2':1},liveStale:false,statusUpdatedAt:new Date().toISOString(),lat:22.99,lon:120.22,direction:''},
            {id:'tdx-dedupe-address',road:'tdx',city:'Tainan',cityName:'臺南市',name:'TDX 不同命名測試站',location:'台南市永康區整合路99號 · 測試停車場',operator:'特爾電力股份有限公司',spaces:2,connectorCount:2,connectors:['CCS2'],maxPowerKw:120,power:'120 kW',liveStateCount:2,availableConnectors:2,occupiedConnectors:0,faultedConnectors:0,unavailableConnectors:0,unknownConnectors:0,liveStates:{'1':2},liveStale:false,statusUpdatedAt:new Date().toISOString(),lat:23.03,lon:120.25,direction:''}
          ];
          return new Response(JSON.stringify(data),{status:response.status,headers:{'Content-Type':'application/json'}});
        });
      }
      if(String(url).includes('/data/operators/upower.json')||String(url).includes('./data/operators/upower.json')){
        return Promise.resolve(new Response(JSON.stringify(fixture),{status:200,headers:{'Content-Type':'application/json'}}));
      }
      if(String(url).includes('/data/operators/evoasis.json')||String(url).includes('./data/operators/evoasis.json')){
        const evoasis={
          schema:1,source:'EVOASIS 官方 DC 站點',updatedAt:new Date().toISOString(),count:2,
          items:[
            {id:'official-evoasis-dup',road:'operator',city:'Tainan',cityName:'臺南市',name:'沙崙綠能城快充站',location:'台南市歸仁區高發二路360號(大武路一段)',operator:'源點科技股份有限公司',operatorWebURL:'https://www.evoasis.com.tw/charging-station',officialSupplemental:true,officialStationType:'DC',sitePowerKw:0,maxPowerKw:null,power:'DC 快充',spaces:0,connectorCount:0,connectors:[],liveStateCount:0,availableConnectors:0,liveStatusKnown:false,lat:null,lon:null,direction:''},
            {id:'official-evoasis-extra',road:'operator',city:'Tainan',cityName:'臺南市',name:'EVOASIS 測試官方補站',location:'台南市安平區測試路2號',operator:'源點科技股份有限公司',operatorWebURL:'https://www.evoasis.com.tw/charging-station',officialSupplemental:true,officialStationType:'DC',sitePowerKw:0,maxPowerKw:null,power:'DC 快充',spaces:0,connectorCount:0,connectors:[],liveStateCount:0,availableConnectors:0,liveStatusKnown:false,lat:null,lon:null,direction:''}
          ]
        };
        return Promise.resolve(new Response(JSON.stringify(evoasis),{status:200,headers:{'Content-Type':'application/json'}}));
      }
      if(String(url).includes('/data/operators/tail.json')||String(url).includes('./data/operators/tail.json')){
        const tail={
          schema:1,source:'TAIL 特爾電力官方站點',updatedAt:new Date().toISOString(),count:2,
          items:[
            {id:'official-tail-extra',road:'operator',city:'Tainan',cityName:'臺南市',name:'TAIL 測試官方補站',location:'台南市永康區測試路3號',operator:'特爾電力股份有限公司',operatorWebURL:'https://www.evtail.com.tw/locations',officialSupplemental:true,sitePowerKw:0,maxPowerKw:null,power:'',spaces:0,connectorCount:0,connectors:[],liveStateCount:0,availableConnectors:0,liveStatusKnown:false,lat:null,lon:null,direction:''},
            {id:'official-tail-address-dup',road:'operator',city:'Tainan',cityName:'臺南市',name:'官方不同命名測試站',location:'台南市永康區整合路99號(B2)',operator:'特爾電力股份有限公司',operatorWebURL:'https://www.evtail.com.tw/locations',officialSource:'TAIL 特爾電力官方站點',officialSourceURL:'https://www.evtail.com.tw/locations',officialSupplemental:true,sitePowerKw:0,maxPowerKw:null,power:'',spaces:0,connectorCount:0,connectors:[],liveStateCount:0,availableConnectors:0,liveStatusKnown:false,lat:null,lon:null,direction:''}
          ]
        };
        return Promise.resolve(new Response(JSON.stringify(tail),{status:200,headers:{'Content-Type':'application/json'}}));
      }
      if(String(url).includes('/data/operators/evalue.json')||String(url).includes('./data/operators/evalue.json')){
        const evalue={
          schema:1,source:'EVALUE 官方充電站',updatedAt:new Date().toISOString(),count:3,
          items:[
            {id:'official-evalue-partner-dup',road:'operator',city:'Tainan',cityName:'臺南市',name:'台南統一精工速邁樂新營二站',location:'',operator:'華城電能科技股份有限公司',operatorId:'90807408',networkKey:'evalue',operatorWebURL:'https://www.evalue.com.tw/find',officialSourceURL:'https://www.evalue.com.tw/find/9991',officialSupplemental:true,sitePowerKw:180,maxPowerKw:180,power:'DC 180kW',spaces:1,connectorCount:1,connectors:['CCS1','CCS2'],liveStateCount:0,availableConnectors:0,liveStatusKnown:false,lat:null,lon:null,direction:''},
            {id:'official-evalue-extra',road:'operator',city:'Tainan',cityName:'臺南市',name:'EVALUE 測試官方補站',location:'',operator:'華城電能科技股份有限公司',operatorId:'90807408',networkKey:'evalue',operatorWebURL:'https://www.evalue.com.tw/find',officialSourceURL:'https://www.evalue.com.tw/find/9992',officialSupplemental:true,sitePowerKw:180,maxPowerKw:180,power:'DC 180kW',spaces:1,connectorCount:1,connectors:['CCS2'],liveStateCount:0,availableConnectors:0,liveStatusKnown:false,lat:null,lon:null,direction:''},
            {id:'official-evalue-format-dup',road:'operator',city:'Tainan',cityName:'臺南市',name:'Times台南測試停車場',location:'',operator:'華城電能科技股份有限公司',operatorId:'90807408',networkKey:'evalue',operatorWebURL:'https://www.evalue.com.tw/find',officialSource:'EVALUE 官方充電站',officialSourceURL:'https://www.evalue.com.tw/find/9993',officialSupplemental:true,sitePowerKw:180,maxPowerKw:180,power:'DC 180kW',spaces:2,connectorCount:2,connectors:['CCS2'],liveStateCount:0,availableConnectors:0,liveStatusKnown:false,lat:null,lon:null,direction:''}
          ]
        };
        return Promise.resolve(new Response(JSON.stringify(evalue),{status:200,headers:{'Content-Type':'application/json'}}));
      }
      return nativeFetch(input,init);
    };
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  try{
    await page.waitForFunction(()=>document.querySelectorAll('#chargingList article').length>0,{timeout:8000});
  }catch(error){
    console.log('INITIAL_RENDER_ERRORS',JSON.stringify(errors));
    console.log('INITIAL_RENDER_STATE',JSON.stringify(await page.evaluate(()=>({
      charging:Array.isArray(state?.charging)?state.charging.length:null,
      html:document.querySelector('#chargingList')?.innerHTML?.slice(0,600)||'',
      body:document.body?.innerText?.slice(0,600)||''
    })).catch(e=>({evaluateError:e.message}))));
    throw error;
  }
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
  await page.waitForFunction(()=>state.charging.some(x=>x.officialSupplemental));
  const all=await page.locator('#chargingList article').count();
  check('Operator official cache supplements TDX without duplicating an existing U-POWER station',await page.evaluate(()=>{
    const extra=state.charging.filter(x=>x.officialSupplemental);
    const dup=state.charging.filter(x=>x.name==='臺中 北屯軍福站'&&chargingOperatorProfile(x)?.key==='upower');
    return extra.some(x=>x.name==='臺南 測試官方補站')&&dup.length===1;
  }));
  check('Operator official site total power is not misused as per-connector fast-charge power',await page.evaluate(()=>{
    const row=state.charging.find(x=>x.name==='臺南 測試官方補站');
    return row&&chargingPowerKw(row)===0&&chargingPowerLabel(row).includes('站點總功率 720 kW');
  }));
  check('EVOASIS official DC cache supplements TDX and remains clearly non-live',await page.evaluate(()=>{
    const row=state.charging.find(x=>x.name==='EVOASIS 測試官方補站');
    return row&&row.officialSupplemental===true&&chargingOperatorProfile(row)?.key==='evoasis'&&chargingPowerKw(row)===0;
  }));
  check('TAIL official cache supplements TDX without inventing seat or power data',await page.evaluate(()=>{
    const row=state.charging.find(x=>x.name==='TAIL 測試官方補站');
    return row&&row.officialSupplemental===true&&chargingOperatorProfile(row)?.key==='tail'&&chargingPowerKw(row)===0&&Number(row.spaces)===0;
  }));
  check('Charging driver-first controls are visible',await page.locator('#chargingFindNow').isVisible()&&await page.locator('#chargingNearby').isVisible()&&await page.locator('#chargingAvailableOnly').isVisible()&&await page.locator('#chargingPriorityFast').isVisible()&&await page.locator('#chargingCity').isVisible()&&await page.locator('#chargingSearch').isVisible());
  check('Charging first-layer action grid is 2x2-ready',(()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return html.includes('id="chargingPriorityFast"')&&css.includes('grid-template-columns:repeat(2,minmax(0,1fr))');})());
  check('Available and priority-fast first-layer actions show city-scoped live station and availability counts',await page.evaluate(()=>{const original=state.charging,city=state.chargingCity;state.chargingCity='Tainan';state.charging=[{id:'u1',city:'Tainan',operator:'旭電馳科研',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:4,availableConnectors:2,maxPowerKw:180},{id:'e1',city:'Tainan',operator:'源點科技股份有限公司',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:6,availableConnectors:3,maxPowerKw:120},{id:'t1',city:'Tainan',operator:'特爾電力股份有限公司',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:2,availableConnectors:1,maxPowerKw:80},{id:'x1',city:'Taipei',operator:'特爾電力股份有限公司',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:2,availableConnectors:2,maxPowerKw:180}];const available=chargingAvailableSnapshot(),priority=chargingPriorityFastSnapshot();state.charging=original;state.chargingCity=city;return available.stations===3&&available.available===6&&priority.stations===2&&priority.available===5;})&&(()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');return html.includes('data-available-status')&&html.includes('data-priority-fast-status');})());
  check('First-layer charging snapshots defensively deduplicate the same station',await page.evaluate(()=>{const rows=[{id:'dup',operator:'旭電馳科研',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:4,availableConnectors:2,maxPowerKw:180},{id:'dup',operator:'旭電馳科研',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:4,availableConnectors:2,maxPowerKw:180}];const snap=chargingSnapshot(rows);return snap.stations===1&&snap.available===2;}));
  check('Priority fast first-layer action has visible pressed state',(()=>{const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return css.includes('.charging-priority-fast[aria-pressed="true"]');})());
  check('Plate final stage exposes compact two-step handoff',(()=>{const js=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/plate.css'),'utf8');return js.includes('plate-primary-final-actions')&&js.includes('最後階段快捷')&&js.includes('立即正式競標')&&css.includes('.plate-primary-final-actions');})());
  check('Current charging rate logic uses verified time bands without pretending dynamic operators are fixed',await page.evaluate(()=>{
    const evoPeak=chargingCurrentRateInfo({operator:'源點科技股份有限公司',name:'台南裕平路超充站'},new Date('2026-10-01T17:00:00+08:00'));
    const evoOff=chargingCurrentRateInfo({operator:'源點科技股份有限公司',name:'台南裕平路超充站'},new Date('2026-10-01T14:00:00+08:00'));
    const up=chargingCurrentRateInfo({operator:'旭電馳科研股份有限公司'},new Date('2026-10-01T17:00:00+08:00'));
    const ev=chargingCurrentRateInfo({operator:'華城電能科技股份有限公司',maxPowerKw:180},new Date('2026-10-01T17:00:00+08:00'));
    const tesla=chargingCurrentRateInfo({operator:'台灣特斯拉汽車有限公司'},new Date('2026-10-01T17:00:00+08:00'));
    return evoPeak?.label.includes('14.9')&&evoOff?.label.includes('6.5')&&up?.label.includes('13.5')&&ev?.label.includes('13.5')&&tesla?.current===false&&tesla?.label.includes('App');
  }));
  check('Nearby charging comparison stays location-driven and shows at most three confirmed stations',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('function renderChargingCompare')&&js.includes('chargingCompareRows')&&js.includes('.slice(0,3)')&&css.includes('.charging-compare-card');})());
  check('Nearby comparison exposes source trust and can jump back to the full station card',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('charging-compare-badges')&&js.includes('data-charge-compare-detail')&&js.includes('data-charging-key')&&css.includes('.charging-item.charging-focus');})());
  check('Known current charging rates expose a 50 kWh cost estimate while dynamic prices do not',await page.evaluate(()=>{const up=chargingCurrentRateInfo({operator:'旭電馳科研股份有限公司'},new Date('2026-10-01T17:00:00+08:00'));const tesla=chargingCurrentRateInfo({operator:'台灣特斯拉汽車有限公司'},new Date('2026-10-01T17:00:00+08:00'));return up?.value===13.5&&Math.round(up.value*50)===675&&tesla?.value===undefined;})&&fs.readFileSync(path.join(root,'assets/styles.css'),'utf8').includes('.charging-compare-estimate'));
  check('Nearby charging cost estimate supports 20/40/50/60 kWh presets',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('chargingCompareKwh:50')&&js.includes('[20,40,50,60]')&&js.includes("Number(rate.value)*kwh")&&css.includes('.charging-compare-kwh');})());
  check('Nearby comparison supports distance/open-count/power/known-price sorting within a 12-station nearby pool',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('chargingCompareSort:"nearby"')&&js.includes("slice(0,12)")&&js.includes('sort==="available"')&&js.includes('sort==="power"')&&js.includes('sort==="price"')&&css.includes('.charging-compare-sort');})());
  check('Nearby comparison summarizes the visible known-rate spread for the selected kWh amount',await page.evaluate(()=>{const rows=[{operator:'旭電馳科研股份有限公司'},{operator:'源點科技股份有限公司',name:'一般指定站'}];const original=Date;const summary=chargingCompareSummary(rows,50);return summary.known===2&&summary.text.includes('元/度')&&summary.text.includes('50 kWh');})&&(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('id="chargingCompareSummary"')&&css.includes('.charging-compare-summary');})());
  check('Nearby comparison labels objective leaders within the visible three stations',await page.evaluate(()=>{const origin=state.chargingOrigin;state.chargingOrigin={lat:25,lon:121};const rows=[{id:'a',name:'A',operator:'旭電馳科研股份有限公司',road:'tdx',lat:25.01,lon:121,liveStatusKnown:true,liveStateCount:4,availableConnectors:1,maxPowerKw:120},{id:'b',name:'B',operator:'旭電馳科研股份有限公司',road:'tdx',lat:25.02,lon:121,liveStatusKnown:true,liveStateCount:6,availableConnectors:4,maxPowerKw:180},{id:'c',name:'C',operator:'旭電馳科研股份有限公司',road:'tdx',lat:25.03,lon:121,liveStatusKnown:true,liveStateCount:3,availableConnectors:2,maxPowerKw:150}];const tags=chargingCompareHighlights(rows);state.chargingOrigin=origin;return tags.get(chargingKey(rows[0])).includes('最近')&&tags.get(chargingKey(rows[1])).includes('空槍最多')&&tags.get(chargingKey(rows[1])).includes('功率最高');}));
  check('Nearby comparison includes vacancy ratio and can mark the highest vacancy ratio separately from raw open count',await page.evaluate(()=>{const origin=state.chargingOrigin;state.chargingOrigin={lat:25,lon:121};const rows=[{id:'a',name:'A',road:'tdx',lat:25.01,lon:121,liveStatusKnown:true,liveStateCount:20,availableConnectors:4,maxPowerKw:120},{id:'b',name:'B',road:'tdx',lat:25.02,lon:121,liveStatusKnown:true,liveStateCount:4,availableConnectors:2,maxPowerKw:120}];const tags=chargingCompareHighlights(rows);state.chargingOrigin=origin;return tags.get(chargingKey(rows[0])).includes('空槍最多')&&tags.get(chargingKey(rows[1])).includes('空槍率最高');})&&fs.readFileSync(path.join(root,'assets/app.js'),'utf8').includes("Math.round((counts.total>0?counts.available/counts.total:0)*100)+'%"));
  check('Nearby charging comparison offers a direct official network handoff when available',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('data-charge-compare-official')&&js.includes('chargingPriorityOfficialUrl(x)');})());
  check('Nearby comparison also marks the freshest live-status timestamp',await page.evaluate(()=>{const origin=state.chargingOrigin;state.chargingOrigin={lat:25,lon:121};const older='2026-10-01T07:00:00Z',newer='2026-10-01T08:00:00Z';const rows=[{id:'a',name:'A',operator:'旭電馳科研股份有限公司',road:'tdx',lat:25.01,lon:121,liveStatusKnown:true,liveStateCount:2,availableConnectors:1,maxPowerKw:120,statusUpdatedAt:older},{id:'b',name:'B',operator:'旭電馳科研股份有限公司',road:'tdx',lat:25.02,lon:121,liveStatusKnown:true,liveStateCount:2,availableConnectors:1,maxPowerKw:120,statusUpdatedAt:newer}];const tags=chargingCompareHighlights(rows);state.chargingOrigin=origin;return !tags.get(chargingKey(rows[0])).includes('資料最新')&&tags.get(chargingKey(rows[1])).includes('資料最新');}));
  check('CCTV cards surface official human-readable landmarks encoded in camera IDs',await page.evaluate(()=>cctvCameraLandmark({id:'CCTV-N1-S-2.800-I-八堵交流道'})==='八堵交流道'&&cctvCameraLandmark({id:'CCTV-N1-S-0.000-M'})==='')&&fs.readFileSync(path.join(root,'assets/styles.css'),'utf8').includes('.cctv-group-landmarks'));
  check('CCTV broad road browsing progressively renders 24 groups while exact searches stay complete',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('cctvGroupLimit:24')&&js.includes('function renderCCTVGroups(groups,limit=groups.length)')&&js.includes('data-cctv-more-groups')&&js.includes('const groupLimit=q?groups.length:state.cctvGroupLimit')&&css.includes('.cctv-more-groups');})());
  check('CCTV selected-road view exposes official landmark quick chips and search includes landmark text',(()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return html.includes('id="cctvQuickLandmarks"')&&js.includes('function renderCCTVQuickLandmarks')&&js.includes('cctvCameraLandmark(x),x.roadNo')&&css.includes('.cctv-quick-landmarks');})());
  check('CCTV road overview surfaces named official landmarks before generic direction text',await page.evaluate(()=>{const rows=[{roadNo:'1',road:'國道1號',direction:'S',id:'CCTV-N1-S-2.800-I-八堵交流道',mile:'2K+800'},{roadNo:'1',road:'國道1號',direction:'S',id:'CCTV-N1-S-11.550-O-汐止系統',mile:'11K+550'}];const markup=renderCCTVRoadOverview(rows);return markup.includes('八堵交流道')&&markup.includes('汐止系統');}));
  check('CCTV nearby mode sorts official camera coordinates locally and caps results at six',await page.evaluate(()=>{const origin=state.cctvOrigin;state.cctvOrigin={lat:25.12,lon:121.73};const rows=[{id:'a',lat:25.121,lon:121.731},{id:'b',lat:25.2,lon:121.8},{id:'c',lat:25.3,lon:121.9},{id:'d',lat:25.4,lon:122},{id:'e',lat:25.5,lon:122.1},{id:'f',lat:25.6,lon:122.2},{id:'g',lat:25.7,lon:122.3}];const nearby=cctvNearbyRows(rows);state.cctvOrigin=origin;return nearby.length===6&&nearby[0].row.id==='a';})&&(()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return html.includes('id="cctvNearbyBtn"')&&js.includes('function requestCCTVNearby')&&js.includes('maximumAge:300000');})());
  check('CCTV nearby mode keeps north/south direction filtering available',await page.evaluate(()=>{const origin=state.cctvOrigin,direction=state.cctvDirection;state.cctvOrigin={lat:25,lon:121};state.cctvDirection='south';const rows=[{id:'s',lat:25.01,lon:121,direction:'S'},{id:'n',lat:25.005,lon:121,direction:'N'}];const nearby=cctvNearbyRows(rows);state.cctvOrigin=origin;state.cctvDirection=direction;return nearby.length===1&&nearby[0].row.id==='s';})&&(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('&&!state.cctvNearby')&&js.includes('cctv-nearby-route')&&css.includes('.cctv-nearby-route');})());
  check('CCTV nearby status summarizes nearby roads and directions',await page.evaluate(()=>{const origin=state.cctvOrigin,direction=state.cctvDirection;state.cctvOrigin={lat:25,lon:121};state.cctvDirection='all';const rows=[{id:'a',lat:25.01,lon:121,road:'國道1號',roadNo:'1',direction:'S'},{id:'b',lat:25.02,lon:121,road:'國道3號',roadNo:'3',direction:'N'}];const text=cctvNearbyScopeSummary(rows);state.cctvOrigin=origin;state.cctvDirection=direction;return text.includes('國道1號')&&text.includes('國道3號')&&text.includes('南下')&&text.includes('北上');}));
  check('CCTV nearby control changes to an explicit return-to-road-list action while active',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('返回道路列表')&&js.includes('關閉附近模式，回到國道／道路選擇');})());
  check('CCTV camera cards expose previous/next same-road same-direction stream actions',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('function cctvAdjacentCamera')&&js.includes('function cctvAdjacentActionMarkup')&&js.includes('前一支')&&js.includes('後一支')&&css.includes('.cctv-adjacent-actions');})());
  check('CCTV live image opens in an in-site viewer with road/direction/place context',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('function openCCTVViewer')&&js.includes('id="cctvViewerImage"')&&js.includes('cctvPlaceLabel(row)')&&js.includes('data-cctv-viewer-original')&&css.includes('.cctv-viewer-panel');})());
  check('CCTV in-site viewer can move to previous/next watchable camera in travel direction',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('function cctvTravelFactorFor')&&js.includes('Boolean(safeHttpUrl(row.stream))')&&js.includes('data-cctv-viewer-nav');})());
  check('CCTV in-site viewer can hand off to the full traffic page for the same freeway',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('data-cctv-viewer-traffic')&&js.includes('closeCCTVViewer();')&&js.includes('openTrafficForRoad(road);');})());
  check('CCTV in-site viewer exposes loading/ready/error status and manual reload',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('function setCCTVViewerState')&&js.includes('function reloadCCTVViewerImage')&&js.includes('data-cctv-viewer-reload')&&js.includes('影像載入中')&&js.includes('即時影像已連線')&&css.includes('.cctv-viewer-state[data-state="error"]');})());
  check('CCTV in-site viewer supports an app-level expanded image mode without relying on browser fullscreen APIs',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('data-cctv-viewer-expand')&&js.includes('classList.toggle("is-expanded")')&&js.includes('縮小影像')&&css.includes('.cctv-viewer.is-expanded .cctv-viewer-panel')&&css.includes('max-height:76dvh');})());
  check('CCTV expanded viewer keeps its button label synchronized while switching cameras',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('root.classList.contains("is-expanded")?"縮小影像":"放大影像"');})());
  check('CCTV in-site viewer shows same-freeway same-direction traffic context without claiming camera-local speed',await page.evaluate(()=>{const traffic=state.traffic;state.traffic={status:'live',highways:{'1':[{direction:'S',speed:80},{direction:'S',speed:40},{direction:'N',speed:10}]}};const out=cctvViewerTrafficSummary({roadNo:'1',direction:'S'});state.traffic=traffic;return out?.speed===60&&out?.slowCount===1;})&&(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('id="cctvViewerTraffic"')&&js.includes('方向整體，非此鏡頭所在地速度')&&css.includes('.cctv-viewer-traffic');})());
  check('CCTV distinguishes camera-list freshness from direct official live-stream status',await page.evaluate(()=>{const fresh=cctvListFreshnessLabel(new Date(Date.now()-5*60000).toISOString());return fresh.includes('5 分前更新');})&&(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('影像：官方串流直連')&&js.includes('官方即時影像已連線')&&js.includes('cctvListFreshnessLabel(state.cctv.updatedAt)');})());
  check('CCTV selected A→B segment maps real freeway-style landmark names onto directed TDX sections',await page.evaluate(()=>{const oldItems=state.cctv.items,start=state.cctvSegmentStartId,end=state.cctvSegmentEndId;const cams=[{id:'CCTV-N1-S-288.000-I-新營交流道',roadNo:'1',direction:'S',mile:'288K',stream:'https://x'},{id:'CCTV-N1-S-319.000-I-永康交流道',roadNo:'1',direction:'S',mile:'319K',stream:'https://x'}];state.cctv.items=cams;state.cctvSegmentStartId=cams[0].id;state.cctvSegmentEndId=cams[1].id;const rows=[{name:'國道1號(新營到下營系統)',speed:100},{name:'國道1號(下營系統到麻豆)',speed:105},{name:'國道1號(麻豆到安定)',speed:99},{name:'國道1號(安定到台南系統)',speed:100},{name:'國道1號(台南系統到永康)',speed:103},{name:'國道1號(永康到大灣)',speed:93}];const result=cctvTrafficSegmentRows(rows);state.cctv.items=oldItems;state.cctvSegmentStartId=start;state.cctvSegmentEndId=end;return cctvTrafficPlaceKey('台南系統交流道')==='台南系統'&&result?.rows?.length===5&&result.rows[0].name.includes('新營到下營系統')&&result.rows.at(-1).name.includes('台南系統到永康');}));
  check('CCTV traffic summary falls back to whole-direction average when A→B endpoints cannot be reliably mapped',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('起終點無法穩定對應 TDX 路段')&&js.includes('traffic.scope===\"segment\"')&&js.includes('沿途區段路況');})());
  check('CCTV traffic summary exposes a direct slowest-section camera jump only when sub-50 km/h data exists',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('data-cctv-traffic-worst')&&js.includes('看最慢路段影像')&&js.includes('traffic.slowCount&&traffic.slowest?.length');})());
  check('CCTV direction traffic summary names the slowest official section and offers full-road handoff',await page.evaluate(()=>{const road=state.cctvRoad,direction=state.cctvDirection,traffic=state.traffic;state.cctvRoad='1';state.cctvDirection='south';state.traffic={status:'live',updatedAt:'2026-10-01T12:00:00Z',highways:{'1':[{name:'A → B',direction:'S',speed:92,dataCollectTime:'2026-10-01T12:00:00Z'},{name:'B → C',direction:'S',speed:31,dataCollectTime:'2026-10-01T12:00:00Z'},{name:'北向',direction:'N',speed:10,dataCollectTime:'2026-10-01T12:00:00Z'}]}};const out=cctvTrafficDirectionSummary();state.cctvRoad=road;state.cctvDirection=direction;state.traffic=traffic;return out?.rows===2&&out?.minSpeed===31&&out?.slowName==='B → C';})&&(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('function openTrafficForRoad')&&js.includes('data-cctv-traffic-detail')&&js.includes('最慢 ')&&css.includes('.cctv-context-traffic-actions');})());
  check('CCTV traffic freshness is consistently rendered as relative age across context, trip brief, homepage and viewer',await page.evaluate(()=>{const live=cctvTrafficFreshnessLabel({status:'live',updatedAt:new Date(Date.now()-5*60000).toISOString()});const stale=cctvTrafficFreshnessLabel({status:'stale',updatedAt:new Date(Date.now()-65*60000).toISOString()});return live.includes('5 分前')&&stale.includes('最後可用')&&stale.includes('小時前');})&&(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return (js.match(/cctvTrafficFreshnessLabel\(/g)||[]).length>=5;})());
  check('CCTV auto-loads the existing official traffic fallback only for a selected freeway direction',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('async function maybeEnsureCCTVTraffic')&&js.includes('state.traffic?.status===\"live\"')&&js.includes('state.cctvDirection===\"all\"')&&(js.match(/void maybeEnsureCCTVTraffic\(\)/g)||[]).length>=4;})());
  check('CCTV successful official refreshes persist an updatedAt timestamp into session cache',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('const updatedAt=new Date().toISOString()')&&js.includes('JSON.stringify({savedAt:Date.now(),updatedAt,source:state.cctv.source,items:rows})')&&js.includes('updatedAt:cached.updatedAt');})());
  check('CCTV source header can force-refresh official data while bypassing the six-hour session cache',(()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return html.includes('id="cctvRefreshBtn"')&&js.includes('async function ensureCCTV(force=false)')&&js.includes('const cached=force?null:')&&js.includes('ensureCCTV(true)')&&css.includes('.cctv-source-tools');})());
  check('CCTV required UI mounts all exist in index.html',(()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');return ['homeCctvSaved','cctvRefreshBtn','cctvActiveContext','cctvSavedRoutes','cctvNearbyBtn','cctvQuickLandmarks','cctvCorridor','cctvList','cctvSourceState','cctvResultSummary'].every(id=>html.includes('id="'+id+'"'));})());
  check('CCTV manual refresh locks the control while an official refresh is in progress',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('if(state.cctvLoading||button.disabled)return')&&js.includes('button.textContent="更新中…"')&&js.includes('button.textContent="重新整理清單"');})());
  check('CCTV trip segments can be saved locally and restored without login or upload',(()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return html.includes('id="cctvSavedRoutes"')&&js.includes('CCTV_SEGMENT_STORAGE_KEY="cola-go-cctv-segments-v1"')&&js.includes('function toggleSavedCCTVSegment')&&js.includes('function applyStoredCCTVSegment')&&js.includes('儲存常用')&&css.includes('.cctv-saved-routes-list');})());
  check('CCTV trip segments can generate shareable COLA GO URLs and restore from URL parameters',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('function cctvSegmentShareUrl')&&js.includes('function readCCTVSharedSegment')&&js.includes('function applyCCTVSharedSegment')&&js.includes('cctvStartName')&&js.includes('cctvEndName')&&js.includes('分享路段');})());
  check('CCTV viewer can share a direct COLA GO link that reopens the exact camera',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('function cctvCameraShareUrl')&&js.includes('function shareCCTVCamera')&&js.includes('function applyCCTVSharedCamera')&&js.includes('cctvCamera')&&js.includes('data-cctv-viewer-share')&&js.includes('分享鏡頭');})());
  check('CCTV saved/shared trip segments preserve landmark-only viewing preference',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('mode:state.cctvCorridorMode===\"landmarks\"?\"landmarks\":\"all\"')&&js.includes('state.cctvCorridorMode=segment.mode===\"landmarks\"?\"landmarks\":\"all\"')&&js.includes('cctvMode')&&js.includes('地標模式');})());
  check('Saved CCTV route cards also expose one-tap share without requiring login',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('data-cctv-saved-share')&&js.includes('navigator.share')&&css.includes('.cctv-saved-route-card .share');})());
  check('CCTV saved-route management supports direct remove and one-tap recent-history clear',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('data-cctv-saved-remove')&&js.includes('data-cctv-clear-recents')&&js.includes('最近路段已清除')&&css.includes('.cctv-saved-route-actions');})());
  check('CCTV keeps a sticky current road/direction/segment context while scrolling',(()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return html.includes('id="cctvActiveContext"')&&js.includes('function renderCCTVActiveContext')&&js.includes('目前查看')&&css.includes('.cctv-active-context{position:sticky');})());
  check('CCTV same-direction traffic summary exposes the three slowest official sections without implying camera-local speed',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('const slowest=valid.slice().sort')&&js.includes('最慢 '+"'"+'+traffic.slowest.length+'+"'"+' 段')&&js.includes('非目前鏡頭所在地速度')&&css.includes('.cctv-context-slowest');})());
  check('CCTV slow-section rows can search the official downstream place name without claiming an exact camera match',await page.evaluate(()=>cctvTrafficDestinationName('國道1號(五堵到汐止)')==='汐止')&&(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('function searchCCTVByTrafficPlace')&&js.includes('data-cctv-traffic-place')&&js.includes('搜尋'+"'"+'+esc(place)+'+"'"+'鏡頭');})());
  check('CCTV slow traffic sections directly open a camera only on exact normalized official-landmark match',await page.evaluate(()=>{const road=state.cctvRoad,direction=state.cctvDirection,items=state.cctv.items,nearby=state.cctvNearby,start=state.cctvSegmentStartId,end=state.cctvSegmentEndId;state.cctvRoad='1';state.cctvDirection='south';state.cctvNearby=false;state.cctvSegmentStartId='';state.cctvSegmentEndId='';state.cctv.items=[{id:'CCTV-N1-S-10.000-I-汐止交流道',roadNo:'1',direction:'S',mile:'10K',stream:'https://example.com/a'},{id:'CCTV-N1-S-20.000-I-五堵',roadNo:'1',direction:'S',mile:'20K',stream:'https://example.com/b'}];const exact=cctvTrafficExactCamera('汐止'),none=cctvTrafficExactCamera('汐科');state.cctvRoad=road;state.cctvDirection=direction;state.cctv.items=items;state.cctvNearby=nearby;state.cctvSegmentStartId=start;state.cctvSegmentEndId=end;return exact?.id.includes('汐止交流道')&&none===null;}));
  check('CCTV traffic summary explains exact landmark matching and keeps nearby-search fallback',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('data-cctv-traffic-camera')&&js.includes('只有 TDX 地名與 CCTV 官方地標名稱精準對上時才直接開鏡頭')&&js.includes('搜尋最慢路段影像')&&css.includes('.cctv-context-traffic-match-note');})());
  check('CCTV current context can summarize official traffic for the same freeway and direction without pretending it is camera-local speed',await page.evaluate(()=>{const road=state.cctvRoad,direction=state.cctvDirection,traffic=state.traffic;state.cctvRoad='1';state.cctvDirection='south';state.traffic={status:'live',updatedAt:'2026-10-01T15:14:00+08:00',highways:{'1':[{direction:'S',speed:80,dataCollectTime:'2026-10-01T15:14:00+08:00'},{direction:'S',speed:60,dataCollectTime:'2026-10-01T15:14:00+08:00'},{direction:'N',speed:20,dataCollectTime:'2026-10-01T15:14:00+08:00'}]}};const out=cctvTrafficDirectionSummary();state.cctvRoad=road;state.cctvDirection=direction;state.traffic=traffic;return out?.available&&out.speed===70&&out.rows===2&&out.label==='車多';})&&(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('同方向路況')&&js.includes('不會用其他方向或舊推測資料代替')&&js.includes('data-cctv-traffic-official')&&css.includes('.cctv-context-traffic');})());
  check('CCTV traffic context explicitly says the average is freeway-direction-wide, not camera-local, and locks manual refresh',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('同國道同方向整體平均，非目前鏡頭所在地速度')&&js.includes('button.textContent="更新中…"')&&js.includes('await ensureClientTraffic()');})());
  check('CCTV traffic context explicitly warns that an active A-to-B camera segment does not narrow the traffic average',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('已套用 A→B 沿途區段；路況仍為整條國道同方向參考')&&js.includes('scopeNote');})());
  check('CCTV slow-section action is phrased as a nearby-image lookup rather than an exact camera match',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('附近影像')&&js.includes('已搜尋「')&&js.includes('附近官方鏡頭');})());
  check('CCTV traffic summary exposes slow-segment count/minimum speed and labels stale data as last-known rather than live',await page.evaluate(()=>{const road=state.cctvRoad,direction=state.cctvDirection,traffic=state.traffic;state.cctvRoad='1';state.cctvDirection='south';state.traffic={status:'stale',updatedAt:'2026-10-01T15:14:00+08:00',highways:{'1':[{direction:'S',speed:85},{direction:'S',speed:42},{direction:'S',speed:28}]}};const out=cctvTrafficDirectionSummary(),markup=cctvTrafficSummaryMarkup();state.cctvRoad=road;state.cctvDirection=direction;state.traffic=traffic;return out?.slowCount===2&&out?.minSpeed===28&&markup.includes('最後可用資料')&&markup.includes('2 段低於 50')&&markup.includes('最低 28 km/h');}));
  check('Homepage surfaces up to three locally saved CCTV routes only when favorites exist',(()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return html.includes('id="homeCctvSaved"')&&js.includes('function renderHomeCCTVQuickRoutes')&&js.includes('slice(0,3)')&&js.includes('data-home-cctv-route')&&css.includes('.home-cctv-saved-list');})());
  check('Homepage favorite CCTV routes can show same-road same-direction official average speed without claiming segment precision',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('function cctvRoadDirectionTrafficSummary')&&js.includes('同方向平均')&&js.includes('cctvRoadDirectionTrafficSummary(item.road,item.direction)')&&css.includes('.home-cctv-saved-list em.good');})());
  check('Homepage CCTV traffic explicitly labels road-direction-wide scope and stale data as last-known',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('同方向整體 ')&&js.includes('traffic?.status===\"stale\"?\"最後可用\":\"官方即時\"')&&js.includes('段低於 50')&&js.includes('路況待取得');})());
  check('CCTV applied trip segments are retained as a short recent-route list',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('function rememberCCTVSegment')&&js.includes('slice(0,5)')&&js.includes('常用／最近路段');})());
  check('CCTV viewer supports mobile swipe and keyboard previous/next navigation',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('touchstart')&&js.includes('touchend')&&js.includes('Math.abs(dx)<60')&&js.includes('ArrowLeft')&&js.includes('ArrowRight')&&js.includes('左右滑動切換鏡頭')&&js.includes('root.focus({preventScroll:true})');})());
  check('CCTV viewer pauses MJPEG when backgrounded and resumes when visible to reduce data/battery use',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('visibilitychange')&&js.includes('document.hidden')&&js.includes('已切到背景，串流暫停以節省流量')&&js.includes('reloadCCTVViewerImage()')&&css.includes('.cctv-viewer-state[data-state="paused"]')&&css.includes('.cctv-viewer-data-note');})());
  check('CCTV viewer can jump directly to previous/next named official landmarks',await page.evaluate(()=>{const road=state.cctvRoad,direction=state.cctvDirection,start=state.cctvSegmentStartId,end=state.cctvSegmentEndId,items=state.cctv.items;const rows=[{id:'CCTV-N1-S-10.000-I-A',roadNo:'1',road:'國道1號',direction:'S',mile:'10K',stream:'https://example.com/a'},{id:'mid1',roadNo:'1',road:'國道1號',direction:'S',mile:'12K',stream:'https://example.com/m1'},{id:'mid2',roadNo:'1',road:'國道1號',direction:'S',mile:'14K',stream:'https://example.com/m2'},{id:'CCTV-N1-S-20.000-I-B',roadNo:'1',road:'國道1號',direction:'S',mile:'20K',stream:'https://example.com/b'}];state.cctvRoad='1';state.cctvDirection='south';state.cctvSegmentStartId=rows[0].id;state.cctvSegmentEndId=rows[3].id;state.cctv.items=rows;const next=cctvAdjacentLandmark(rows[1],1),prev=cctvAdjacentLandmark(rows[2],-1);state.cctvRoad=road;state.cctvDirection=direction;state.cctvSegmentStartId=start;state.cctvSegmentEndId=end;state.cctv.items=items;return next?.id===rows[3].id&&prev?.id===rows[0].id;})&&(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('上一地標')&&js.includes('下一地標')&&js.includes('data-cctv-viewer-landmark');})());
  check('CCTV selected-road direction exposes a dedicated sequential corridor viewer',(()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return html.includes('id="cctvCorridor"')&&js.includes('function cctvCorridorRows')&&js.includes('function renderCCTVCorridor')&&js.includes('上一支')&&js.includes('下一支')&&css.includes('.cctv-corridor-actions');})());
  check('CCTV corridor stays visible after road selection and prompts for direction before sequencing',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('選擇方向開始路段連看')&&js.includes('data-cctv-corridor-direction')&&css.includes('.cctv-corridor-direction');})());
  check('CCTV corridor can limit viewing to an official-landmark start/end trip segment',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('cctvSegmentStartId')&&js.includes('cctvSegmentEndId')&&js.includes('function cctvCorridorSegmentMarkup')&&js.includes('data-cctv-segment-start')&&js.includes('data-cctv-segment-end')&&js.includes('套用這一段')&&css.includes('.cctv-corridor-segment');})());
  check('CCTV trip segment slices the travel-ordered corridor inclusively between selected landmarks',await page.evaluate(()=>{const road=state.cctvRoad,direction=state.cctvDirection,nearby=state.cctvNearby,start=state.cctvSegmentStartId,end=state.cctvSegmentEndId;state.cctvRoad='1';state.cctvDirection='south';state.cctvNearby=false;const rows=[{id:'CCTV-N1-S-10.000-I-A',roadNo:'1',direction:'S',mile:'10K',stream:'https://example.com/a'},{id:'mid',roadNo:'1',direction:'S',mile:'15K',stream:'https://example.com/m'},{id:'CCTV-N1-S-20.000-I-B',roadNo:'1',direction:'S',mile:'20K',stream:'https://example.com/b'},{id:'late',roadNo:'1',direction:'S',mile:'30K',stream:'https://example.com/l'}];state.cctvSegmentStartId=rows[0].id;state.cctvSegmentEndId=rows[2].id;const out=cctvCorridorRows(rows);state.cctvRoad=road;state.cctvDirection=direction;state.cctvNearby=nearby;state.cctvSegmentStartId=start;state.cctvSegmentEndId=end;return out.length===3&&out[0].id===rows[0].id&&out[2].id===rows[2].id;}));
  check('CCTV trip segment summarizes distance, watchable cameras and official landmarks',await page.evaluate(()=>{const road=state.cctvRoad,direction=state.cctvDirection,nearby=state.cctvNearby,start=state.cctvSegmentStartId,end=state.cctvSegmentEndId;state.cctvRoad='1';state.cctvDirection='south';state.cctvNearby=false;const rows=[{id:'CCTV-N1-S-10.000-I-A',roadNo:'1',direction:'S',mile:'10K',stream:'https://example.com/a'},{id:'mid',roadNo:'1',direction:'S',mile:'15K',stream:'https://example.com/m'},{id:'CCTV-N1-S-20.000-I-B',roadNo:'1',direction:'S',mile:'20K',stream:'https://example.com/b'}];state.cctvSegmentStartId=rows[0].id;state.cctvSegmentEndId=rows[2].id;const out=cctvCorridorSegmentSummary(rows);state.cctvRoad=road;state.cctvDirection=direction;state.cctvNearby=nearby;state.cctvSegmentStartId=start;state.cctvSegmentEndId=end;return out?.distance===10&&out?.cameras===3&&out?.landmarks===2;}));
  check('CCTV viewer previous/next stays inside the active trip segment',await page.evaluate(()=>{const road=state.cctvRoad,direction=state.cctvDirection,start=state.cctvSegmentStartId,end=state.cctvSegmentEndId,items=state.cctv.items;const rows=[{id:'before',roadNo:'1',road:'國道1號',direction:'S',mile:'5K',stream:'https://example.com/x'},{id:'CCTV-N1-S-10.000-I-A',roadNo:'1',road:'國道1號',direction:'S',mile:'10K',stream:'https://example.com/a'},{id:'mid',roadNo:'1',road:'國道1號',direction:'S',mile:'15K',stream:'https://example.com/m'},{id:'CCTV-N1-S-20.000-I-B',roadNo:'1',road:'國道1號',direction:'S',mile:'20K',stream:'https://example.com/b'},{id:'after',roadNo:'1',road:'國道1號',direction:'S',mile:'25K',stream:'https://example.com/y'}];state.cctvRoad='1';state.cctvDirection='south';state.cctvSegmentStartId=rows[1].id;state.cctvSegmentEndId=rows[3].id;state.cctv.items=rows;const prev=cctvAdjacentCamera(rows[1],-1),next=cctvAdjacentCamera(rows[3],1),inside=cctvAdjacentCamera(rows[1],1);state.cctvRoad=road;state.cctvDirection=direction;state.cctvSegmentStartId=start;state.cctvSegmentEndId=end;state.cctv.items=items;return prev===null&&next===null&&inside?.id==='mid';}));
  check('CCTV trip segment exposes a compact set of named highlight cameras in travel order',await page.evaluate(()=>{const rows=Array.from({length:14},(_,i)=>({id:'CCTV-N1-S-'+i+'.000-I-'+(i%2===0?'交流道':'地標')+i,mile:i+'K',stream:'https://example.com/'+i}));const out=cctvCorridorHighlightRows(rows);return out.length<=10&&out.every((item,i,arr)=>i===0||arr[i-1].index<item.index);})&&(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('沿途重點鏡頭')&&js.includes('data-cctv-highlight')&&css.includes('.cctv-corridor-highlight-list');})());
  check('CCTV active trip brief distinguishes mapped A→B traffic from whole-direction fallback',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('function cctvTripBriefMarkup')&&js.includes('出發前巡路')&&js.includes('沿途平均 ')&&js.includes('同方向平均 ')&&js.includes('TDX 官方 A→B 沿途區段平均')&&js.includes('已回退整條國道同方向平均')&&css.includes('.cctv-trip-brief-metrics');})());
  check('CCTV pre-trip brief keeps slow sections inside the active traffic scope and only direct-opens exact landmark matches',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('沿途較慢路段')&&js.includes('僅計算目前 A→B 可可靠對應的 TDX 官方路段')&&js.includes('cctvTrafficExactCamera(place)')&&js.includes('data-cctv-traffic-camera')&&js.includes('data-cctv-traffic-place')&&js.includes('完整國道路況')&&js.includes('data-cctv-traffic-official')&&css.includes('.cctv-trip-slow');})());
  check('CCTV pre-trip brief can start directly from the first highlight camera and continue with viewer landmark navigation',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('data-cctv-trip-start')&&js.includes('const first=highlights[0]')&&js.includes('openCCTVViewer(first.row.id)')&&js.includes('下一地標');})());
  check('Any CCTV result card can hand off directly into the matching road-direction corridor position',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('function focusCCTVCorridorFromCamera')&&js.includes('data-cctv-focus')&&js.includes('從這裡連看')&&js.includes('state.cctvCorridorIndex=index>=0?index:0')&&css.includes('[data-cctv-focus]');})());
  check('CCTV corridor current camera includes official start/end place context',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('place=cctvPlaceLabel(current)')&&js.includes("'<p>'+esc(place)+'</p>'");})());
  check('CCTV corridor includes a mile-order scrubber for quickly jumping across many cameras',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('data-cctv-corridor-range')&&js.includes('type="range"')&&js.includes('cctvMileLabel(corridor[0].mile)')&&css.includes('.cctv-corridor-range');})());
  check('CCTV corridor supports all-camera versus named-landmark-only viewing mode',await page.evaluate(()=>{const road=state.cctvRoad,direction=state.cctvDirection,nearby=state.cctvNearby,mode=state.cctvCorridorMode;state.cctvRoad='1';state.cctvDirection='south';state.cctvNearby=false;const rows=[{id:'plain',roadNo:'1',direction:'S',mile:'10K',stream:'https://example.com/p'},{id:'CCTV-N1-S-20.000-I-交流道A',roadNo:'1',direction:'S',mile:'20K',stream:'https://example.com/a'}];state.cctvCorridorMode='all';const all=cctvCorridorRows(rows);state.cctvCorridorMode='landmarks';const named=cctvCorridorRows(rows);state.cctvRoad=road;state.cctvDirection=direction;state.cctvNearby=nearby;state.cctvCorridorMode=mode;return all.length===2&&named.length===1&&named[0].id.includes('交流道A');})&&(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('cctvCorridorMode:"all"')&&js.includes('data-cctv-corridor-mode="landmarks"')&&js.includes('只看地標')&&css.includes('.cctv-corridor-mode');})());
  check('CCTV viewer swipe/next obeys landmark-only mode inside the selected road and direction',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('state.cctvCorridorMode==="landmarks"')&&js.includes('rows=rows.filter(row=>Boolean(cctvCameraLandmark(row)))');})());
  check('CCTV corridor follows freeway travel direction and excludes cameras without a usable stream',await page.evaluate(()=>{const road=state.cctvRoad,direction=state.cctvDirection,nearby=state.cctvNearby;state.cctvRoad='1';state.cctvNearby=false;const rows=[{id:'10',roadNo:'1',direction:'N',mile:'10K+000',stream:'https://example.com/10'},{id:'20',roadNo:'1',direction:'N',mile:'20K+000',stream:'https://example.com/20'},{id:'30',roadNo:'1',direction:'N',mile:'30K+000',stream:''}];state.cctvDirection='north';const north=cctvCorridorRows(rows);state.cctvDirection='south';const south=cctvCorridorRows(rows.map(x=>({...x,direction:'S'})));state.cctvRoad=road;state.cctvDirection=direction;state.cctvNearby=nearby;return north.length===2&&north[0].id==='20'&&north[1].id==='10'&&south.length===2&&south[0].id==='10'&&south[1].id==='20';}));
  check('CCTV corridor current camera keeps a direct map-position action',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('cctv-corridor-secondary')&&js.includes("data-cctv-map=\"");})());
  check('CCTV corridor can jump to and highlight the matching full camera card',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('data-cctv-corridor-card')&&js.includes('data-cctv-camera-id')&&js.includes('cctv-camera-focus')&&css.includes('.cctv-camera.cctv-camera-focus');})());
  check('CCTV corridor landmark chips follow the current camera instead of staying at the road origin',await page.evaluate(()=>{const rows=Array.from({length:12},(_,i)=>({id:'CCTV-N1-S-'+i+'.000-I-地標'+i,mile:i+'K',stream:'https://example.com/'+i}));const windowRows=cctvCorridorLandmarkWindow(rows,9);return windowRows.length===8&&windowRows.some(x=>x.index===9)&&windowRows[0].index>0;}));
  check('CCTV corridor exposes the next named official landmark and mileage gap',await page.evaluate(()=>{const rows=[{id:'CCTV-N1-S-10.000-M',mile:'10K',stream:'https://example.com/a'},{id:'CCTV-N1-S-13.500-I-下一地標',mile:'13.5K',stream:'https://example.com/b'}];const next=cctvCorridorNextLandmark(rows,0);return next?.name==='下一地標'&&Math.abs(next.gap-3.5)<0.01;})&&fs.readFileSync(path.join(root,'assets/styles.css'),'utf8').includes('.cctv-corridor-next'));
  check('CCTV corridor requires a specific road and direction and sorts southbound by increasing mile',await page.evaluate(()=>{const road=state.cctvRoad,direction=state.cctvDirection,nearby=state.cctvNearby;state.cctvRoad='1';state.cctvDirection='south';state.cctvNearby=false;const rows=[{id:'b',roadNo:'1',direction:'S',mile:'20K+000',stream:'https://example.com/b'},{id:'a',roadNo:'1',direction:'S',mile:'10K+000',stream:'https://example.com/a'},{id:'n',roadNo:'1',direction:'N',mile:'5K+000',stream:'https://example.com/n'}];const out=cctvCorridorRows(rows);state.cctvRoad=road;state.cctvDirection=direction;state.cctvNearby=nearby;return out.length===2&&out[0].id==='a'&&out[1].id==='b';}));
  check('Charging cards expose a compact decision strip',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return js.includes('chargingDecisionStripMarkup')&&js.includes('charging-decision-strip')&&css.includes('.charging-decision-strip');})());
  check('Every final-stage watched plate has two-step quick actions and collapsed secondary actions',(()=>{const js=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/plate.css'),'utf8');return js.includes('plate-watch-final-actions')&&js.includes('plate-watch-more')&&js.includes('立即正式競標')&&css.includes('.plate-watch-final-actions')&&css.includes('.plate-watch-more');})());
  check('Charging active filters stay visible in a sticky result bar with one-tap clear',(()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return html.includes('id="chargingResultBar"')&&html.includes('id="chargingResultClear"')&&js.includes('chargingResultClear')&&css.includes('.charging-result-bar { position:sticky');})());
  check('Primary plate final stage exposes a mobile fixed dock above bottom navigation',(()=>{const js=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/plate.css'),'utf8');return js.includes('renderPlateFinalDock')&&js.includes('data-plate-dock-action="official"')&&css.includes('.plate-final-dock{position:fixed')&&css.includes('bottom:calc(var(--nav)');})());
  check('Mobile plate view reserves content space while the final-stage dock is active',(()=>{const js=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/plate.css'),'utf8');return js.includes('classList.toggle("has-final-dock",active)')&&css.includes('[data-view="plate"].has-final-dock{padding-bottom:calc(104px');})());
  check('Visible plate countdowns tick every second without fetching or rerendering the page',(()=>{const js=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return js.includes('function updatePlateCountdowns')&&js.includes('data-plate-countdown-at')&&js.includes("setInterval(()=>{if(document.visibilityState===\"visible\"&&$p('[data-view=\"plate\"].active'))updatePlateCountdowns()},1000)");})());
  check('Charging secondary facts no longer repeat distance and power already shown in the decision strip',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const marker=js.indexOf("'<div class=\"specs charging-facts\">'");const end=js.indexOf("'</div>'+",marker);const block=js.slice(marker,end);return marker>=0&&!block.includes('charging-distance')&&!block.includes('charging-power')&&block.includes('charging-rate')&&block.includes('charging-connector');})());
  check('Six primary charging networks are first-layer controls',await page.locator('#chargingMajorFilter [data-charge-major]').evaluateAll(nodes=>nodes.map(n=>n.dataset.chargeMajor).join(',')==='all,evoasis,upower,tail,evalue,icharging,tesla'));
  await page.waitForFunction(()=>[...document.querySelectorAll('#chargingMajorFilter [data-major-status]')].every(el=>/站/.test(el.textContent||'')));
  check('Major network controls expose station and live counts',await page.locator('#chargingMajorFilter [data-major-status]').evaluateAll(nodes=>nodes.length===7&&nodes.every(n=>n.textContent.includes('站'))));
  check('Major network source semantics stay visible',await page.locator('.charging-network-legend').evaluateAll(nodes=>nodes.some(n=>(n.textContent||'').includes('TDX')&&(n.textContent||'').includes('即時'))));
  await page.waitForFunction(()=>document.querySelectorAll('#chargingPriorityGrid [data-charge-priority]').length===4);
  check('Priority charging panel focuses on top three plus Tesla',await page.locator('#chargingPriorityGrid [data-charge-priority]').evaluateAll(nodes=>nodes.map(n=>n.dataset.chargePriority).join(',')==='evoasis,upower,tail,tesla'));
  check('Priority charging panel surfaces availability, power and rate context',await page.locator('#chargingPriorityPanel').textContent().then(x=>x.includes('空槍')&&x.includes('kW')&&x.includes('元/度')));
  check('Priority charging panel includes live-data freshness context',await page.evaluate(()=>{
    const original=state.charging;
    state.charging=[
      {operator:'旭電馳科研',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:4,availableConnectors:2,maxPowerKw:180,statusUpdatedAt:'2026-10-01T06:40:00Z'},
      {operator:'旭電馳科研',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:4,availableConnectors:1,maxPowerKw:120,statusUpdatedAt:'2026-10-01T06:45:00Z'}
    ];
    const stats=chargingPriorityStats('upower');
    state.charging=original;
    return stats.available===3&&stats.maxKw===180&&stats.latestUpdatedAt==='2026-10-01T06:45:00.000Z';
  })&&fs.readFileSync(path.join(root,'assets/app.js'),'utf8').includes('charging-priority-freshness'));
  check('U-POWER 2026 official member rate summary is present',await page.evaluate(()=>{const p=CHARGING_OPERATOR_PROFILES.find(x=>x.key==='upower');return p?.rateShort.includes('夏月會員')&&p?.rateShort.includes('6.9')&&p?.rateShort.includes('13.5')&&p?.rateHint.includes('5/16–10/15')&&p?.rateHint.includes('16:00–22:00')&&p?.rateHint.includes('非會員全天 14 元/度');}));
  check('EVOASIS official selected-station time rate is clearly scoped',await page.evaluate(()=>{const p=CHARGING_OPERATOR_PROFILES.find(x=>x.key==='evoasis');return p?.rateShort.includes('指定站')&&p?.rateShort.includes('14.9')&&p?.rateHint.includes('21:00～隔日 14:59')&&p?.rateHint.includes('臺南市公有停車場尖峰 12.7')&&p?.rateHint.includes('分段計費');}));
  check('TAIL rate does not invent a network-wide number',await page.evaluate(()=>CHARGING_OPERATOR_PROFILES.find(x=>x.key==='tail')?.rateShort.includes('依現場')));
  check('Tesla rate stays dynamic and app-confirmed',await page.evaluate(()=>CHARGING_OPERATOR_PROFILES.find(x=>x.key==='tesla')?.rateShort.includes('動態費率')));
  check('Primary charging networks carry current official rate verification dates',await page.evaluate(()=>['evoasis','upower','tail','tesla','evalue','icharging'].every(key=>CHARGING_OPERATOR_PROFILES.find(x=>x.key===key)?.rateCheckedAt==='2026-10-01')&&chargingRateCheckedLabel({operator:'台灣特斯拉汽車有限公司'}).includes('2026/10/1')&&chargingRateCheckedLabel({operator:'中興電工機械股份有限公司'}).includes('2026/10/1')));
  await page.waitForFunction(()=>document.querySelector('[data-charge-major="icharging"] [data-major-status]')?.textContent.includes('官方地圖可用'));
  check('iCharging exposes official map availability without pretending the station cache is complete',await page.locator('[data-charge-major="icharging"] [data-major-status]').textContent().then(x=>x.includes('官方地圖可用'))&&(()=>{const src=fs.readFileSync(path.join(root,'assets/tdx-runtime.js'),'utf8');return src.includes('站點快取待導入')&&!src.includes('待新增導入中');})());
  check('Public charging copy matches iCharging current integration state',(()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');return html.includes('iCharging 官方充電地圖與費率入口已可使用')&&!html.includes('獨立官方站點資料標示「待新增導入中」');})());
  check('Advanced operator filter is built from actual charging operators',await page.evaluate(()=>{syncChargingOperatorOptions();const values=[...document.querySelectorAll('#chargingOperator option')].map(x=>x.value);return values[0]==='all'&&values.includes('中興電工機械股份有限公司')&&values.includes('華城電能科技股份有限公司');}));
  check('All six primary networks expose an official first-layer card action',await page.evaluate(()=>['evoasis','upower','tail','evalue','icharging','tesla'].every(key=>{const p=CHARGING_OPERATOR_PROFILES.find(x=>x.key===key);const sample={operator:p.names?.[0]||'',networkKey:key};return Boolean(chargingPriorityOfficialUrl(sample))&&chargingPriorityOfficialLabel(sample).includes('官方');})));
  check('EVALUE and iCharging cards expose verified operator rate context',await page.evaluate(()=>chargingDecisionRateLabel({operator:'華城電能科技股份有限公司'}).includes('6.6')&&chargingDecisionRateLabel({operator:'中興電工機械股份有限公司'}).includes('9.2')&&chargingRateCheckedLabel({operator:'中興電工機械股份有限公司'}).includes('2026/10/1')));
  await page.waitForFunction(()=>document.querySelectorAll('#chargingCoverageGrid [data-coverage-major]').length===6);
  await page.waitForFunction(()=>state.charging.some(x=>x.officialSupplemental&&x.networkKey==='evalue'),{timeout:12000}).catch(()=>{});
  check('EVALUE official source is loaded when available',await page.evaluate(()=>state.charging.some(x=>x.networkKey==='evalue')));
  check('Coverage panel reports all six primary networks',await page.locator('#chargingCoverageGrid [data-coverage-major]').evaluateAll(nodes=>nodes.map(n=>n.dataset.coverageMajor).join(',')==='evoasis,upower,tail,evalue,icharging,tesla'));
  check('Coverage panel keeps operator source health contract',(()=>{const src=fs.readFileSync(path.join(root,'assets/tdx-runtime.js'),'utf8');return src.includes('grid.dataset.sourceHealth=healthKeys.join(",")')&&src.includes('operatorSourceHealth=Object.fromEntries');})());
  check('Coverage panel explains live and official supplemental semantics',await page.locator('#chargingCoverage').textContent().then(x=>x.includes('即時')&&x.includes('官方補')));
  check('Charging cards expose decision-first availability without repeating a large live-state panel',await page.locator('#chargingList .charging-decision-strip').first().isVisible()&&await page.locator('#chargingList .charging-trust').first().isVisible());
  check('Charging source trust clearly distinguishes live, stale, official supplemental, and station-only data',await page.evaluate(()=>chargingTrustInfo({road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:2,availableConnectors:1,statusUpdatedAt:new Date().toISOString()}).level==='live'&&chargingTrustInfo({road:'tdx',liveStale:true,statusUpdatedAt:new Date().toISOString()}).level==='stale'&&chargingTrustInfo({officialSupplemental:true,road:'operator'}).level==='official'&&chargingTrustInfo({road:'tdx',liveStateCount:0}).level==='source'));
  check('Detailed connector status is collapsed by default and auto-opens only for faults',await page.evaluate(()=>chargingStatusMarkup({road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:3,availableConnectors:1,occupiedConnectors:2,faultedConnectors:0,statusUpdatedAt:new Date().toISOString()}).startsWith('<details class="charging-live-detail">')&&chargingStatusMarkup({road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:3,availableConnectors:1,occupiedConnectors:1,faultedConnectors:1,statusUpdatedAt:new Date().toISOString()}).startsWith('<details class="charging-live-detail" open>')));
  check('Primary charging card actions put navigation and operator official link first',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const nav=js.indexOf('charging-go-primary');const official=js.indexOf('charging-official-primary',nav);const map=js.indexOf('charging-map-choice',nav);return nav>=0&&official>nav&&map>official;})());
  check('Charging live freshness is human-readable',await page.evaluate(()=>{
    const now=Date.parse('2026-10-01T08:50:00+08:00');
    return chargingLiveAgeLabel('2026-10-01T08:47:00+08:00',now)==='3 分鐘前更新'&&chargingLiveAgeLabel('2026-10-01T06:50:00+08:00',now)==='2 小時前更新';
  }));
  check('Charging cards surface compact rate information when TDX provides it',await page.locator('#chargingList .charging-rate').count()>0);
  check('Priority charging cards label price-source semantics',await page.evaluate(()=>
    chargingRateSourceLabel({operator:'旭電馳科研',road:'tdx',chargingRate:'計度/固定/9元每度'}).includes('本站費率')&&
    chargingRateSourceLabel({operator:'源點科技股份有限公司'}).includes('業者官方方案')&&
    chargingRateSourceLabel({operator:'特爾電力股份有限公司'}).includes('依現場')&&
    chargingRateSourceLabel({operator:'台灣特斯拉汽車有限公司'}).includes('Tesla App')
  ));
  check('Priority station rate fallback uses verified operator rules',await page.evaluate(()=>
    chargingDecisionRateLabel({operator:'旭電馳科研'})==='會員 6.9／8.5／13.5・非會員 14 元/度'&&
    chargingDecisionRateLabel({operator:'源點科技股份有限公司'}).includes('指定站 6.5')&&
    chargingDecisionRateLabel({operator:'特爾電力股份有限公司'}).includes('依現場')&&
    chargingDecisionRateLabel({operator:'台灣特斯拉汽車有限公司'}).includes('動態費率')
  ));
  check('Primary charging quick filter can require top networks, live availability, and 100 kW+',await page.evaluate(()=>
    chargingQuickMatch({operator:'旭電馳科研',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:4,availableConnectors:2,maxPowerKw:180})===false
      ? false
      : (state.chargingQuick='priorityfast',chargingQuickMatch({operator:'旭電馳科研',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:4,availableConnectors:2,maxPowerKw:180})===true&&chargingQuickMatch({operator:'華城電能科技股份有限公司',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:4,availableConnectors:2,maxPowerKw:180})===false)
  ));
  await page.evaluate(()=>{state.chargingQuick='all';renderCharging();});
  check('Primary charging quick filter is visible',await page.locator('[data-charge-quick="priorityfast"]').isVisible());
  await page.locator('#chargingPriorityFast').click();
  check('First-layer priority fast action applies trusted fast mode',await page.evaluate(()=>state.chargingQuick==='priorityfast'&&state.chargingMajor==='all'&&state.chargingOperator==='all'&&state.chargingPower===0&&state.chargingConnector==='all'&&state.road==='all'));
  await page.locator('#chargingPriorityFast').click();
  check('Primary charging fast confidence sort prefers fresher data, then more availability, then power',await page.evaluate(()=>{
    const base={operator:'旭電馳科研',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:4,maxPowerKw:180};
    const old={...base,name:'舊站',availableConnectors:4,statusUpdatedAt:'2026-10-01T12:00:00+08:00'};
    const fresh={...base,name:'新站',availableConnectors:1,statusUpdatedAt:'2026-10-01T12:10:00+08:00'};
    const equalFreshA={...base,name:'A',availableConnectors:1,maxPowerKw:180,statusUpdatedAt:'2026-10-01T12:10:00+08:00'};
    const equalFreshB={...base,name:'B',availableConnectors:3,maxPowerKw:120,statusUpdatedAt:'2026-10-01T12:10:00+08:00'};
    return chargingPriorityFastSort(fresh,old)<0&&chargingPriorityFastSort(equalFreshB,equalFreshA)<0;
  }));
  check('Primary charging fast result explains why a station qualified',await page.evaluate(()=>{
    const x={operator:'旭電馳科研',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:4,availableConnectors:2,maxPowerKw:180,statusUpdatedAt:new Date().toISOString()};
    const label=chargingPriorityFastReason(x);
    return label.includes('主力空槍快充')&&label.includes('空槍 2')&&label.includes('180 kW');
  }));
  check('Primary charging fast empty state offers safe relaxed alternatives',(()=>{const js=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return js.includes('目前沒有同時符合的主力空槍快充')&&js.includes('data-charge-relax="available"')&&js.includes('data-charge-relax="fast"')&&js.includes('未知槍況、逾時資料與未知功率不會混進主力快充結果');})());
  check('Primary charging fast eligibility rejects unknown, stale, slow, and non-priority data',await page.evaluate(()=>
    chargingPriorityFastEligible({operator:'旭電馳科研',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:4,availableConnectors:2,maxPowerKw:180})===true&&
    chargingPriorityFastEligible({operator:'旭電馳科研',road:'tdx',liveStale:false,liveStateCount:0,availableConnectors:0,maxPowerKw:180})===false&&
    chargingPriorityFastEligible({operator:'旭電馳科研',road:'tdx',liveStale:true,liveStatusKnown:true,liveStateCount:4,availableConnectors:2,maxPowerKw:180})===false&&
    chargingPriorityFastEligible({operator:'旭電馳科研',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:4,availableConnectors:2,maxPowerKw:80})===false&&
    chargingPriorityFastEligible({operator:'華城電能科技股份有限公司',road:'tdx',liveStale:false,liveStatusKnown:true,liveStateCount:4,availableConnectors:2,maxPowerKw:180})===false
  ));
  check('Priority station power labels never confuse site total with connector maximum',await page.evaluate(()=>
    chargingDecisionPowerLabel({operator:'旭電馳科研',maxPowerKw:360})==='最高功率 360 kW'&&
    chargingDecisionPowerLabel({operator:'旭電馳科研',officialSupplemental:true,sitePowerKw:720})==='站點總功率 720 kW'&&
    chargingDecisionPowerLabel({operator:'台灣特斯拉汽車有限公司'})==='最高功率依 Tesla App'
  ));
  check('Charging city control stays in the first layer',await page.locator('#chargingCity').evaluate(el=>!el.closest('.charging-advanced')));
  check('Charging source HTML formatting becomes readable text',await page.evaluate(()=>chargingDisplayText('尖峰<br>12.7元&nbsp;每度')==='尖峰 · 12.7元 每度'));
  check('ConnectorType 2 and 5 normalize to CCS2 and J1772',await page.evaluate(()=>chargingConnectors({connectors:['2','5']}).join(',')==='CCS2,J1772'));
  check('Missing official ConnectorType is shown explicitly',await page.evaluate(()=>chargingConnectors({road:'tdx',connectors:[]}).join(',')==='接頭類型未提供'));
  check('EV2 operator maps TDX legal identity to consumer brand',await page.evaluate(()=>chargingOperatorLabel({operatorId:'58430020',operator:'程豐資通股份有限公司'})==='電小二 EV2'));
  check('U-POWER operator maps TDX legal identity to consumer brand',await page.evaluate(()=>chargingOperatorLabel({operatorId:'83235398',operator:'旭電馳科研'})==='U-POWER'));
  check('iCharging profile exposes official map, charging guide, and fee source',await page.evaluate(()=>{
    const p=CHARGING_OPERATOR_PROFILES.find(x=>x.key==='icharging');
    return Boolean(p?.stationMap&&p?.chargeGuide&&p?.rateGuide&&p?.chargeHint?.includes('iParking'));
  }));
  check('Major operator detail prefers station-specific official source URL',await page.evaluate(()=>chargingDetailMarkup({officialSupplemental:true,officialSource:'EVALUE 官方充電站',officialSourceURL:'https://example.com/station',operator:'華城電能科技股份有限公司',road:'operator',connectors:[],spaces:0}).includes('https://example.com/station')));
  check('EVALUE current official time-of-use rates stay power-scoped',await page.evaluate(()=>{const p=CHARGING_OPERATOR_PROFILES.find(x=>x.key==='evalue');return p?.rateShort.includes('120–180 kW')&&p?.rateShort.includes('240 kW+')&&p?.rateHint.includes('6.6')&&p?.rateHint.includes('13.5')&&p?.rateHint.includes('部分站不適用');}));
  check('Network key can classify partner-operated stations into EVALUE',await page.evaluate(()=>chargingOperatorProfile({operator:'聯永物業股份有限公司',networkKey:'evalue'})?.key==='evalue'));
  check('Format-only operator duplicate merges into the TDX row',await page.evaluate(()=>{
    const rows=state.charging.filter(x=>String(x.name).includes('Times')&&String(x.location).includes('測試路88號'));
    return rows.length===1&&rows[0].road==='tdx'&&rows[0].officialNetworkMatch===true&&rows[0].officialSourceURL==='https://www.evalue.com.tw/find/9993';
  }));
  check('Same-address differently named operator duplicate merges into the TDX row',await page.evaluate(()=>{
    const rows=state.charging.filter(x=>String(x.location).includes('整合路99號'));
    return rows.length===1&&rows[0].road==='tdx'&&rows[0].officialNetworkMatch===true&&rows[0].officialSource==='TAIL 特爾電力官方站點';
  }));
  check('Primary charging network list is the six requested providers',await page.evaluate(()=>CHARGING_MAJOR_KEYS.join(',')==='evoasis,upower,tail,evalue,icharging,tesla'));
  check('iCharging official plug-and-charge capability matches Dongshan service area',await page.evaluate(()=>chargingCapabilities({operator:'中興電工機械股份有限公司',name:'東山服務區'}).some(x=>x.key==='plug-and-charge')));
  check('iCharging 2026 verified highway expansion matches Hsinying northbound',await page.evaluate(()=>chargingCapabilities({operator:'中興電工機械股份有限公司',name:'新營服務區北向'}).some(x=>x.key==='plug-and-charge')));
  check('iCharging current official rate hint is present',await page.evaluate(()=>{const p=CHARGING_OPERATOR_PROFILES.find(x=>x.key==='icharging');return p?.rateShort.includes('高速 9.2–10')&&p?.rateShort.includes('市區 8')&&p?.rateHint.includes('公告原價 12 元/度')&&p?.rateHint.includes('每分鐘 7 元');}));
  check('Tesla guidance never claims website list is live availability',await page.evaluate(()=>CHARGING_OPERATOR_PROFILES.find(x=>x.key==='tesla')?.networkHint.includes('不把官方網站清單假裝成即時空槍')));
  check('Tesla missing TDX live state directs users to official app availability',await page.evaluate(()=>chargingStatusMarkup({road:'tdx',operator:'台灣特斯拉汽車有限公司',liveStateCount:0,availableConnectors:0,liveStatusKnown:false,liveStale:false}).includes('Tesla App 可查看官方可用充電座')));
  check('Tesla stale TDX state does not show false zero availability',await page.evaluate(()=>chargingStatusMarkup({road:'tdx',operator:'台灣特斯拉汽車有限公司',liveStateCount:6,availableConnectors:0,liveStatusKnown:true,liveStale:true}).includes('Tesla App 可查看官方可用充電座')));
  check('Priority network cards expose an official first-layer action',await page.evaluate(()=>
    chargingPriorityOfficialLabel({operator:'台灣特斯拉汽車有限公司'})==='Tesla 官方'&&
    chargingPriorityOfficialUrl({operator:'台灣特斯拉汽車有限公司'}).includes('tesla.com')&&
    chargingPriorityOfficialUrl({operator:'旭電馳科研'}).includes('u-power.com.tw')
  ));
  check('iCharging plug-and-charge capability does not leak to unrelated stations',await page.evaluate(()=>chargingCapabilities({operator:'中興電工機械股份有限公司',name:'捷運石牌站'}).length===0));
  check('Charging rate summary parses fixed per-kWh rates',await page.evaluate(()=>chargingRateSummary('計度/固定/9元每度')==='9 元/度'));
  check('Charging rate summary parses peak/off-peak ranges',await page.evaluate(()=>chargingRateSummary('計度/離峰/6.5元每度，計度/尖峰/13.5元每度')==='6.5–13.5 元/度'));
  check('Charging rate summary labels time-only pricing without inventing kWh cost',await page.evaluate(()=>chargingRateSummary('計時/每1分鐘0.99元')==='計時制'));
  check('EV2 aliases are searchable',await page.evaluate(()=>chargingOperatorSearchText({operatorId:'58430020',operator:'程豐資通股份有限公司',name:'測試站'}).includes('電小二')));
  check('ConnectorStatus 1/2/3/0 compatibility is available/occupied/fault/unknown',await page.evaluate(()=>{
    const counts=chargingLiveCounts({liveStateCount:4,liveStates:{'0':1,'1':1,'2':1,'3':1}});
    return counts.available===1&&counts.occupied===1&&counts.fault===1&&counts.unknown===1;
  }));

  await page.locator('#chargingAvailableOnly').click();
  check('Available-only toggle updates dedicated state',await page.evaluate(()=>state.chargingAvailableOnly===true));
  check('Available-only never treats stale or unknown rows as available',await page.evaluate(()=>[...document.querySelectorAll('#chargingList .charging-item')].every(card=>card.classList.contains('is-available')))&&((await page.locator('#chargingList article').count()>0)||((await page.locator('#chargingList .empty').textContent()).includes('即時空槍'))));
  await page.locator('#chargingAvailableOnly').click();
  await page.locator('[data-charge-quick="fast"]').click();
  check('100 kW quick filter only includes verified 100 kW+ rows',await page.evaluate(()=>state.charging.filter(chargingQuickMatch).every(x=>chargingPowerKw(x)>=100)));
  await page.locator('[data-charge-quick="all"]').click();
  await page.locator('[data-charge-quick="ev2"]').click();
  check('EV2 quick filter selects only mapped EV2 operator rows',await page.evaluate(()=>state.charging.filter(chargingQuickMatch).every(x=>chargingOperatorProfile(x)?.key==='ev2')));
  await page.locator('[data-charge-quick="all"]').click();
  await page.locator('#chargingCoverage').evaluate(el=>{el.open=true;});
  await page.locator('#chargingCoverageGrid [data-coverage-major="upower"]').click();
  check('Coverage row acts as a network filter shortcut',await page.evaluate(()=>state.chargingMajor==='upower'));
  await page.locator('[data-charge-major="all"]').click();
  await page.locator('[data-charge-major="upower"]').click();
  check('U-POWER major filter maps TDX and official supplemental station identities',await page.locator('#chargingList article').count()>0&&await page.locator('#chargingList article').evaluateAll(nodes=>nodes.every(el=>el.textContent.includes('U-POWER'))));
  check('Official supplemental U-POWER card is visibly identified as operator official data',await page.locator('#chargingList article').filter({hasText:'臺南 測試官方補站'}).textContent().then(x=>x.includes('業者官方')&&x.includes('即時空槍尚未由 TDX 驗證')));
  await page.locator('[data-charge-quick="fast"]').click();
  check('Major operator and technical quick filters can be combined',await page.locator('#chargingList article').count()>0&&await page.evaluate(()=>state.chargingMajor==='upower'&&state.chargingQuick==='fast'));
  await page.locator('[data-charge-quick="all"]').click();
  await page.locator('[data-charge-major="all"]').click();

  await page.locator('#chargingCity').selectOption('Tainan');
  await page.locator('#chargingSearch').fill('東山服務區');
  check('Known iCharging plug-and-charge station shows capability chip',await page.locator('#chargingList .charging-capability').filter({hasText:'插槍即充'}).count()>0);
  await page.locator('#chargingSearch').fill('');
  check('Charging city selector filters actual TDX cards',await page.locator('#chargingList article').count()>0&&await page.evaluate(()=>state.chargingCity==='Tainan'&&[...document.querySelectorAll('#chargingList article')].every(el=>el.textContent.includes('臺南市'))));
  await page.locator('#chargingSearch').fill('東山服務區');
  if(await page.locator('#chargingList article').count()){
    await page.locator('#chargingList article details.charging-more').first().evaluate(el=>{el.open=true;});
    check('iCharging station detail exposes official charging method',await page.locator('#chargingList article').first().textContent().then(x=>x.includes('iParking')));
    check('iCharging station detail links official fee page',await page.locator('#chargingList article a').evaluateAll(nodes=>nodes.some(a=>a.textContent.includes('官方費率')&&a.href.includes('icharging.com.tw'))));
  }
  await page.locator('#chargingSearch').fill('電小二');
  check('Tainan EV2 stations are discoverable by consumer brand',await page.locator('#chargingList article').count()>0&&await page.locator('#chargingList article').evaluateAll(nodes=>nodes.every(el=>el.textContent.includes('電小二 EV2'))));
  check('EV2 cards expose an official operator source',await page.locator('#chargingList a[href="https://www.ev2.com.tw/"]').count()>0);
  check('Operator selector exposes EV2 brand instead of only the legal company name',await page.locator('#chargingOperator option').evaluateAll(opts=>opts.some(o=>o.textContent==='電小二 EV2'&&o.value==='程豐資通股份有限公司')));
  await page.locator('#chargingSearch').fill('');
  await page.locator('#chargingCity').selectOption('all');
  await page.locator('.charging-advanced > summary').click();
  await page.locator('#roadFilter [data-road="3"]').click();
  const filtered=await page.locator('#chargingList article').count();
  check('Charging road filter stays available in advanced filters',filtered>0&&filtered<all);
  await page.locator('#chargingConnector').selectOption('CCS2');
  check('Connector filter decodes legacy numeric TDX connector types',await page.locator('#chargingList article').count()>0&&await page.evaluate(()=>state.chargingConnector==='CCS2'));
  await page.locator('#resetChargingFilters').click();

  await page.locator('#chargingSearch').fill('NO_MATCH_UI_TEST');
  check('Charging search empty state',await page.locator('#chargingList article').count()===0);
  await page.locator('#resetChargingFilters').click();

  await page.locator('#chargingList [data-charge-favorite]').first().click();
  await page.locator('#chargingFavoritesOnly').click();
  check('Charging favorites persist and filter',await page.locator('#chargingList article').count()===1 && await page.evaluate(()=>JSON.parse(localStorage.getItem('cola-go-charging-favorites')||'[]').length===1));
  await page.locator('#resetChargingFilters').click();

  await context.grantPermissions(['geolocation'],{origin:base});
  await context.setGeolocation({latitude:22.993,longitude:120.214});
  await page.locator('#chargingFindNow').click();
  await page.waitForFunction(()=>state.chargingSort==='nearby'&&state.chargingAvailableOnly===true&&Boolean(state.chargingOrigin));
  check('One-tap nearby available action combines location, distance sorting, and live availability',await page.evaluate(()=>state.chargingSort==='nearby'&&state.chargingAvailableOnly===true&&state.chargingCity==='all'));
  const oneTapBad=await page.evaluate(()=>[...document.querySelectorAll('#chargingList .charging-item')].filter(card=>!card.classList.contains('is-available')).length);
  check('One-tap nearby available never shows a non-available card',oneTapBad===0);
  if(await page.locator('[data-charge-show-nearby]').count()){
    await page.locator('[data-charge-show-nearby]').click();
    check('Empty available state can fall back to nearby stations without losing distance sort',await page.evaluate(()=>state.chargingAvailableOnly===false&&state.chargingSort==='nearby'));
    await page.locator('#chargingAvailableOnly').click();
  }
  await page.locator('#resetChargingFilters').click();
  await page.locator('#chargingNearby').click();
  await page.waitForFunction(()=>state.chargingSort==='nearby'&&Boolean(state.chargingOrigin));
  check('Nearby charging uses geolocation only after explicit tap',await page.evaluate(()=>state.chargingSort==='nearby'&&Math.abs(state.chargingOrigin.lat-22.993)<0.001));
  check('Nearby charging renders distance when coordinates exist',await page.locator('#chargingList .specs').first().textContent().then(x=>x.includes('km')));
  check('Nearby charging is sorted by displayed distance',await page.evaluate(()=>{
    const values=[...document.querySelectorAll('#chargingList .charging-item')].slice(0,20).map(card=>{
      const node=[...card.querySelectorAll('.specs span')].find(x=>/ km$/.test(x.textContent.trim()));
      return node?Number.parseFloat(node.textContent):NaN;
    }).filter(Number.isFinite);
    return values.length>=2&&values.every((value,index)=>index===0||value>=values[index-1]-0.11);
  }));
  await page.locator('#chargingNearby').click();
  check('Nearby charging can return to smart sorting',await page.evaluate(()=>state.chargingSort==='smart'&&state.chargingOrigin===null));

  await context.clearPermissions();
  await page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(success,fail)=>fail({code:1,message:'denied'})}}));
  await page.locator('#chargingNearby').click();
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('無法取得位置'));
  check('Denied geolocation leaves charging usable without storing an origin',await page.evaluate(()=>state.chargingOrigin===null&&state.chargingSort==='smart'));

  await page.locator('#chargingList [data-charge-go]').first().click();
  check('Charging direct navigation is one tap and prefers Google Maps on non-Apple platforms',await page.evaluate(()=>window.__opened.at(-1).startsWith('https://www.google.com/maps/dir/')));
  const firstNav=page.locator('#chargingList [data-charge-nav-toggle]').first();
  const firstNavKey=await firstNav.getAttribute('data-charge-nav-toggle');
  await firstNav.click();
  const sameNavMenu=page.locator('#chargingList [data-charge-nav-menu="'+firstNavKey+'"]');
  await sameNavMenu.locator('[data-charge-google]').click();
  check('Charging Google navigation prefers lat/lon coordinates',await page.evaluate(()=>{
    const u=new URL(window.__opened.at(-1)); return /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(u.searchParams.get('destination')||'');
  }));
  await sameNavMenu.locator('[data-charge-apple]').click();
  check('Charging Apple navigation prefers lat/lon coordinates',await page.evaluate(()=>{
    const u=new URL(window.__opened.at(-1)); return /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(u.searchParams.get('daddr')||'');
  }));
  await page.locator('details[data-ui-panel="charging-maps"]').evaluate(el=>{el.open=true;});
  await page.locator('#nearbyGoogle').click();
  check('Generic nearby charging search remains available',await page.evaluate(()=>window.__opened.at(-1).startsWith('https://www.google.com/maps/search/')));
  await page.locator('.bottom-nav [data-go=parking]').click();
  await page.locator('#parkingCitySelect').selectOption('Tainan');
  check('Parking city selector updates scope',await page.locator('#parkingScopeTitle').textContent()==='臺南市');
  await page.locator('details[data-ui-panel="parking-maps"]').evaluate(el=>{el.open=true;});
  await page.locator('#parkingNearbyApple').click();
  check('Nearby parking opens Apple Maps',await page.evaluate(()=>window.__opened.at(-1).startsWith('https://maps.apple.com/')));
  await page.locator('.bottom-nav [data-go=highway]').click();
  await page.locator('#highwayTabs [data-highway="3"]').click();
  check('Highway chips update selected road',await page.evaluate(()=>state.highway==='3'));
  await page.locator('[data-view=highway] .cctv-link').click();
  await page.locator('#cctvRoadFilter button').last().click();
  check('CCTV filter handler remains wired',await page.evaluate(()=>state.cctvRoad===document.querySelector('#cctvRoadFilter button:last-child').dataset.cctvRoad));
  // CCTV V3: checked-in official data first, then explicit fixtures for missing fields.
  const officialCCTV=await page.evaluate(()=>state.cctv);
  await page.locator('#cctvRoadFilter [data-cctv-road="all"]').click();
  await page.locator('[data-cctv-select="6"]').waitFor();
  check('CCTV initial view shows six freeway cards and no cameras',await page.locator('[data-cctv-select]:not([data-cctv-select="other"])').count()===6&&await page.locator('.cctv-camera').count()===0);
  await page.locator('[data-cctv-select="1"]').click();
  check('CCTV freeway selection shows grouped segments',await page.locator('.cctv-group').count()>0);
  check('CCTV directions reflect actual selected-road data',await page.evaluate(()=>{
    const keys=new Set(state.cctv.items.filter(x=>String(x.roadNo)==='1').map(x=>cctvDirectionKey(x.direction)));
    return [...document.querySelectorAll('[data-cctv-direction]')].every(b=>b.dataset.cctvDirection==='all'||b.hidden===!keys.has(b.dataset.cctvDirection));
  }));
  await page.locator('#cctvRoadFilter [data-cctv-road="all"]').click();
  await page.locator('#cctvSearch').fill('321K');
  check('CCTV 321K search matches actual cache cameras',await page.locator('.cctv-camera').count()>0&&await page.locator('.cctv-camera-info b').allTextContents().then(a=>a.every(x=>/^321(?:\.\d+)?K$/.test(x))));
  await page.locator('#cctvSearch').fill('');
  const baseCamera={id:'fixture-S-321',road:'國道1號',roadNo:'1',direction:'S',mile:'321K+000',start:'永康交流道',end:'台南系統',lat:23.03,lon:120.23,stream:'https://cctvn.freeway.gov.tw/abs2mjpg/bmjpg?camera=10000'};
  const fixture=[baseCamera,
    {...baseCamera,id:'fixture-S-322',direction:'SB',mile:'322K',lat:null,lon:null},
    {...baseCamera,id:'fixture-N-321',direction:'N'},
    {...baseCamera,id:'fixture-east',road:'國道2號',roadNo:'2',direction:'E',start:'機場系統',end:'服務區',mile:'9K',lat:91},
    {...baseCamera,id:'fixture-west',road:'國道2號',roadNo:'2',direction:'W',mile:'9K',lat:0,lon:0},
    {...baseCamera,id:'fixture-other',road:'國道2號',roadNo:'2',direction:'匝道',mile:'9K',lat:'',lon:''},
    {...baseCamera,id:'fixture-fallback-29',road:'國道5號',roadNo:'5',direction:'S',start:'',end:'',mile:'29K+999'},
    {...baseCamera,id:'fixture-fallback-30',road:'國道5號',roadNo:'5',direction:'S',start:'',end:'',mile:'30K+000'},
    {...baseCamera,id:'fixture-partial',start:'新營服務區',end:'',mile:'390K'},
    {...baseCamera,id:'fixture-unsafe',mile:'400K',start:'<img src=x onerror=alert(1)>',end:'',lat:null,stream:'javascript:alert(1)'}
  ];
  await page.evaluate(items=>{state.cctv={status:'ready',items,source:'Explicit QA fixture'};selectCCTVRoad('all');},fixture);
  check('CCTV same official endpoints and direction merge; opposite direction stays separate',await page.evaluate(()=>{
    const groups=cctvGroupRows(state.cctv.items);
    return groups.some(g=>g.place==='永康交流道 → 台南系統'&&g.direction==='南下'&&g.items.length===2)&&groups.some(g=>g.place==='永康交流道 → 台南系統'&&g.direction==='北上'&&g.items.length===1);
  }));
  check('CCTV missing endpoints alone use mileage bands with 10K boundaries',await page.evaluate(()=>{
    const rows=state.cctv.items;
    return cctvPlaceLabel(rows.find(x=>x.id==='fixture-fallback-29')).includes('20–29K 路段（里程分段）')&&cctvPlaceLabel(rows.find(x=>x.id==='fixture-fallback-30')).includes('30–39K 路段（里程分段）')&&!cctvPlaceLabel(rows.find(x=>x.id==='fixture-partial')).includes('里程分段');
  }));
  check('CCTV aliases normalize all four directions',await page.evaluate(()=>[['N','NB','north','北'],['S','SB','south','南'],['E','EB','east','東'],['W','WB','west','西']].every((group,i)=>group.every(x=>cctvDirectionKey(x)===['north','south','east','west'][i]))));
  check('CCTV JSON/XML official parsers retain endpoints, stream and coordinates',await page.evaluate(()=>{
    const a={CCTVID:'parser',RoadName:'國道1號',RoadDirection:'S',Start:'永康交流道',End:'台南系統',LocationMile:'321K',VideoStreamURL:'https://cctvn.freeway.gov.tw/abs2mjpg/bmjpg?camera=10000',PositionLat:23,PositionLon:120};
    const json=parseCCTVJson([a])[0],xml=parseCCTVXml('<root><CCTV>'+Object.entries(a).map(([k,v])=>`<${k}>${v}</${k}>`).join('')+'</CCTV></root>')[0];
    return [json,xml].every(x=>x?.start===a.Start&&x.end===a.End&&x.stream===a.VideoStreamURL&&x.lat===23&&x.lon===120)&&normalizeCCTVObject({...a,PositionLat:'',PositionLon:''}).lat===null;
  }));
  await page.locator('#cctvSearch').fill('永康');
  check('CCTV all-road place search directly shows related segments (fixture)',await page.locator('.cctv-group').count()===4&&await page.locator('.cctv-road-card').count()===0);
  await page.locator('#cctvSearch').fill('fixture-S-322');
  check('CCTV ID search and invalid-coordinate map suppression',await page.locator('.cctv-camera').count()===1&&await page.locator('[data-cctv-map]').count()===0);
  await page.locator('#cctvSearch').fill('fixture-S-321');
  await page.locator('[data-cctv-stream]').click();
  check('CCTV button opens original official VideoStreamURL',await page.evaluate(()=>window.__opened.at(-1))===baseCamera.stream);
  await page.locator('[data-cctv-map]').click();
  check('CCTV valid-coordinate map uses original coordinates',await page.evaluate(()=>new URL(window.__opened.at(-1)).searchParams.get('query'))==='23.03,120.23');
  await page.locator('#cctvSearch').fill('fixture-unsafe');
  check('CCTV unsafe stream and endpoint HTML cannot execute',await page.locator('[data-cctv-stream]').count()===0&&await page.locator('#cctvList img').count()===0);
  await page.locator('#cctvSearch').fill('');
  for(const width of [390,430,1440]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    await page.locator('#cctvRoadFilter [data-cctv-road="all"]').click();
    await page.screenshot({path:path.join(output,`cctv-v3-overview-${width}.png`)});
    check(`CCTV overview ${width}px: no overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('[data-cctv-select="1"]').click();
    await page.locator('[data-cctv-direction="south"]').click();
    check(`CCTV south filter ${width}px`,await page.evaluate(()=>[...document.querySelectorAll('.cctv-group-kicker')].every(x=>x.textContent.startsWith('南下'))));
    await page.screenshot({path:path.join(output,`cctv-v3-segments-${width}.png`)});
    check(`CCTV segments ${width}px: no overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const closed=page.locator('.cctv-group:not([open])').first();
    await closed.locator('summary').click();
    check(`CCTV segment expands ${width}px`,await closed.count()===0||await page.locator('.cctv-group[open]').count()===2);
    await page.locator('#cctvRoadFilter [data-cctv-road="2"]').click();
    check(`CCTV changing road resets direction ${width}px`,await page.evaluate(()=>state.cctvDirection==='all')&&await page.locator('[data-cctv-direction="east"]').isVisible()&&await page.locator('[data-cctv-direction="west"]').isVisible()&&await page.locator('[data-cctv-direction="other"]').isVisible()&&!await page.locator('[data-cctv-direction="south"]').isVisible());
  }
  await page.evaluate(data=>{state.cctv=data;selectCCTVRoad('all');},officialCCTV);
  await page.setViewportSize({width:390,height:844});
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
  check('Home header no longer exposes refresh/install icon buttons',await page.locator('.top-actions').count()===0&&await page.locator('#refreshBtn').count()===0);
  await page.evaluate(()=>show('tools'));
  check('PWA install entry moved to owner tools',await page.locator('#installBtn').isVisible()&&await page.locator('#installBtn').textContent().then(x=>x.includes('安裝 COLA GO')));
  await page.locator('#installBtn').click();
  check('PWA installation help is available',await page.locator('#toast').textContent().then(x=>x.includes('主畫面')||x.includes('安裝')));
  await page.evaluate(()=>show('shortcuts'));
  check('Shortcut secondary panels start collapsed',await page.locator('[data-view="shortcuts"] details.ui-disclosure[open]').count()===0);
  check('Tesla real-car test controls remain available after expanding help',await page.locator('#copyTeslaReportBtn').count()===1&&await page.locator('#copyTeslaReportBtn').isVisible());
  await page.evaluate(()=>document.querySelectorAll('[data-view="shortcuts"] details.ui-disclosure').forEach(el=>{el.setAttribute('data-allow-multi','');el.open=true;}));
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
  check('Verified shortcut file URLs are exposed',JSON.stringify(await page.locator('.shortcut-file-download').evaluateAll(a=>a.map(x=>new URL(x.href).pathname)))===JSON.stringify(['/downloads/oil-driver.shortcut','/downloads/tesla-driver.shortcut']));
  check('Verified shortcut download filenames are explicit',JSON.stringify(await page.locator('.shortcut-file-download').evaluateAll(a=>a.map(x=>x.getAttribute('download'))))===JSON.stringify(['油車助手.shortcut','特斯拉助手.shortcut']));
  check('Oil v1.3 signed file hash matches verified build',crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'downloads/oil-driver.shortcut'))).digest('hex')==='5c93e0962c98fae03e5590608332e6571912406b98d021ed87ad5e10d1ec836b');
  check('Tesla v1.6 signed file hash matches verified build',crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'downloads/tesla-driver.shortcut'))).digest('hex')==='9288fe2d90db62258d43a10ba6b007b766bd94d848d15ced2b5a917bb6179438');
  check('Personal iCloud shortcut links are removed',await page.locator('a[href*="icloud.com/shortcuts/"]').count()===0);
  check('CarKit cards contain no legacy iCloud controls',await page.locator('.shortcut-icloud').count()===0);
  check('Oil card documents v1.3 Shield plus JiXing',await page.locator('.shortcut-card').filter({hasText:'油車助手'}).textContent().then(x=>x.includes('v1.3')&&x.includes('神盾')&&x.includes('極行')));
  check('Tesla card documents v1.6 driving tools',await page.locator('.shortcut-card').filter({hasText:'特斯拉助手'}).textContent().then(x=>x.includes('v1.6')&&x.includes('神盾')&&x.includes('極行')&&x.includes('高速公路1968')&&x.includes('Tesla App')));
  check('Tesla real-car test controls are available but collapsed by default',await page.locator('#copyTeslaReportBtn').count()===1&&!(await page.locator('#copyTeslaReportBtn').isVisible())&&!(await page.locator('details[data-ui-panel="tesla-test"]').getAttribute('open')));
  check('Oil validation status is explicit',await page.locator('.shortcut-card').filter({hasText:'油車助手'}).locator('.shortcut-proof').textContent().then(x=>x.includes('已驗證：v1.3 iPhone 實機正常')&&x.includes('神盾／極行可開啟')&&x.includes('待實車：CarPlay／Bluetooth 上車自動觸發、不同品牌車機相容性')));
  check('Tesla validation status is explicit',await page.locator('.shortcut-card').filter({hasText:'特斯拉助手'}).locator('.shortcut-proof').textContent().then(x=>x.includes('已驗證：v1.6 iPhone 實機正常')&&x.includes('神盾／極行／高速公路1968／Tesla App')&&x.includes('待驗證：Tesla Bluetooth 自動觸發／實車遠端控制')));
  check('iOS 27 direct automation setup is explicit',await page.locator('.shortcut-automation').filter({hasText:'上車自動啟動｜只要設定一次'}).textContent().then(x=>x.includes('編輯')&&x.includes('自動化操作')&&x.includes('CarPlay')&&x.includes('Bluetooth')&&x.includes('允許鎖定時執行')&&!x.includes('動作選「執行捷徑」')));
  check('Oil setup deep link targets installed shortcut',await page.locator('.shortcut-card').filter({hasText:'油車助手'}).locator('.shortcut-setup-link').getAttribute('href').then(x=>x==='shortcuts://open-shortcut?name=%E6%B2%B9%E8%BB%8A%E5%8A%A9%E6%89%8B'));
  check('Tesla setup deep link targets installed shortcut',await page.locator('.shortcut-card').filter({hasText:'特斯拉助手'}).locator('.shortcut-setup-link').getAttribute('href').then(x=>x==='shortcuts://open-shortcut?name=%E7%89%B9%E6%96%AF%E6%8B%89%E5%8A%A9%E6%89%8B'));
  check('Tesla report template contains required fields',(await page.locator('#teslaReportTemplate').textContent()).includes('iPhone 型號：')&&(await page.locator('#teslaReportTemplate').textContent()).includes('Siri「特斯拉助手」：'));
  await page.locator('details[data-ui-panel="tesla-test"]').evaluate(el=>{el.setAttribute('data-allow-multi','');el.open=true;});
  await page.locator('#copyTeslaReportBtn').click();
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('已複製 Tesla 實車回報格式'));
  check('Tesla report copy feedback appears',await page.locator('#toast').textContent().then(x=>x.includes('已複製 Tesla 實車回報格式')));
  await page.evaluate(()=>{localStorage.removeItem('cola-go-plate-watch-v1');show('plate',false);});
  await page.locator('#plateCandidate').fill('1010');
  await page.locator('#plateBudget').fill('20000');
  await page.locator('#plateCurrentPrice').fill('12000');
  await page.locator('#plateAddWatch').click();
  check('Plate Center watchlist stores candidate locally',await page.locator('.plate-watch-card').filter({hasText:'1010'}).isVisible());
  check('Plate Center budget is visible',await page.locator('.plate-watch-card').filter({hasText:'1010'}).textContent().then(x=>x.includes('20,000')&&x.includes('12,000')));
  check('Plate Center candidate dashboard is visible',await page.locator('#plateWatchDashboard').isVisible()&&await page.locator('#plateWatchLiveCount').isVisible());
  check('Plate Center primary target panel is visible',await page.locator('#platePrimaryTarget').isVisible());
  check('Plate Center keeps candidate backup and restore behind advanced tools',await page.locator('#plateWatchBackup').count()===1&&await page.locator('#plateWatchRestore').count()===1&&!(await page.locator('#plateWatchTools').getAttribute('open')));
  check('Plate Center retains readable auction summary and official history inside advanced tools',await page.locator('#plateWatchCopySummary').count()===1&&await page.locator('#plateHistoryOfficial').count()===1&&(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('function watchSummaryText(')&&src.includes('async function openPlateHistoryFor(')&&src.includes('freshness.label')&&src.includes('目前出價／出價次數：請以官方頁即時資訊為準');})());
  await page.locator('.plate-watch-card').filter({hasText:'1010'}).locator('[data-plate-action="primary"]').click();
  check('Plate Center can pin a primary target locally',await page.locator('#platePrimaryTarget').textContent().then(x=>x.includes('CES-8888')&&x.includes('主攻'))&&await page.evaluate(()=>localStorage.getItem('cola-go-plate-primary-v1')==='1010'));
  check('Plate Center primary target surfaces budget state and manual-price timestamp',await page.locator('#platePrimaryTarget').textContent().then(x=>x.includes('手動價更新')&&x.includes('預算')));
  check('Plate Center primary target exposes neutral decision-readiness state',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('function watchDecisionReadiness(')&&src.includes('可進官方確認')&&src.includes('先設定最高預算')&&src.includes('目前手動價已超預算')&&src.includes('等待官方公告');})()&&fs.readFileSync(path.join(root,'assets/plate.css'),'utf8').includes('.plate-readiness'));
  check('Plate Center primary target explains official auction timeline and extension uncertainty',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('function platePrimaryTimeline(')&&src.includes('官方起標')&&src.includes('原公告決標')&&src.includes('最終決標時間與結果請以官方頁為準');})()&&fs.readFileSync(path.join(root,'assets/plate.css'),'utf8').includes('.plate-primary-timeline'));
  check('Plate Center primary target exposes direct official actions',await page.locator('#platePrimaryTarget [data-plate-primary-action="official"]').isVisible()&&await page.locator('#platePrimaryTarget [data-plate-primary-action="history"]').isVisible()&&await page.locator('#platePrimaryTarget [data-plate-primary-action="summary"]').isVisible()&&await page.locator('#platePrimaryTarget [data-plate-primary-action="budget"]').isVisible()&&await page.locator('#platePrimaryTarget [data-plate-primary-action="price"]').isVisible());
  check('Plate Center candidate and primary edits share one implementation',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('function editWatchBudget(')&&src.includes('function editWatchPrice(')&&src.includes('if(action==="budget"&&row){editWatchBudget(row);return}')&&src.includes('if(action==="price"&&row){editWatchPrice(row);return}');})());
  check('Plate Center stale-price actions can become visually prominent',(()=>{const js=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/plate.css'),'utf8');return js.includes('plate-price-refresh-needed')&&js.includes('立即更新手動價')&&css.includes('.plate-price-refresh-needed');})());
  check('Plate Center flags stale manual prices before final-stage decisions',await page.evaluate(()=>{
    const now=Date.parse('2026-10-01T13:00:00+08:00');
    const fresh=watchPriceFreshness({current:12000,priceUpdatedAt:'2026-10-01T12:58:00+08:00'},now);
    const stale=watchPriceFreshness({current:12000,priceUpdatedAt:'2026-10-01T12:40:00+08:00'},now);
    return fresh.level==='fresh'&&stale.level==='stale'&&stale.label.includes('20 分鐘');
  })&&fs.readFileSync(path.join(root,'assets/plate.css'),'utf8').includes('.plate-price-warning'));
  check('Plate Center candidate backup keeps private state local and implements restore logic',await page.evaluate(()=>JSON.parse(localStorage.getItem('cola-go-plate-watch-v1')||'[]').some(x=>x.plate==='1010'))&&(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('function watchBackupPayload()')&&src.includes('function restoreWatchPayload(raw)')&&src.includes('primaryPlate:loadPrimaryPlate()')&&src.includes('schema:2');})());
  check('Plate Center advanced filters and tools are compact by default',await page.locator('[data-plate-watch-filter]').count()===5&&await page.locator('#plateWatchTools').count()===1&&!(await page.locator('#plateWatchTools').getAttribute('open'))&&await page.locator('#plateWatchSort').count()===1&&await page.locator('#plateWatchCopyList').count()===1);
  check('Plate Center final-stage logic and 3-minute extension reminder are present',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('function auctionFinalStage(')&&src.includes('function watchFinalStage(')&&src.includes('function deadlineReminder(')&&src.includes('3 分鐘（延長可能區）')&&src.includes('立即正式競標')&&src.includes('最多 10 次')&&!src.includes('[[15,"15 分鐘"],[5,"5 分鐘"],[3,"3 分鐘（延長可能區）"],[1,"1 分鐘"]].forEach');})());
  check('Plate Center final-stage styling keeps urgent bid action prominent',fs.readFileSync(path.join(root,'assets/plate.css'),'utf8').includes('.plate-bid-now')&&fs.readFileSync(path.join(root,'assets/plate.css'),'utf8').includes('.plate-final-stage'));
  await page.locator('#plateCandidate').fill('1117');
  await page.locator('#plateAddWatch').click();
  await page.locator('#plateWatchSort').selectOption('plate');
  check('Plate Center candidate number sorting works',await page.locator('#plateWatchList .plate-watch-card .plate-watch-number').first().textContent().then(x=>x.includes('1010')));
  await page.locator('[data-plate-watch-filter="nomatch"]').click();
  check('Plate Center candidate filter visibly updates selection',await page.locator('[data-plate-watch-filter="nomatch"]').evaluate(el=>el.classList.contains('active')));
  await page.locator('[data-plate-watch-filter="all"]').click();
  check('Plate Center candidate actions include copy and official history',await page.locator('#plateWatchList [data-plate-action="copy"]').count()>0&&await page.locator('#plateWatchList [data-plate-action="history"]').count()>0&&(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('async function openPlateHistoryFor(')&&src.includes('已複製，可貼到官方歷史查詢');})());
  check('Plate Center official bidding copies the candidate before handoff',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('async function openOfficialBidFor(')&&src.includes('已複製，請到官方頁完成正式競標')&&src.includes('await openOfficialBidFor(row.plate)')&&src.includes('openOfficialBidFor(row?.plate||loadPrimaryPlate())')&&src.includes('openOfficialBidFor(value)');})());
  await page.locator('#plateWatchList [data-plate-action="history"]').first().click();
  check('Plate Center official history action opens MVDIS history',await page.evaluate(()=>window.__opened.at(-1)?.includes('/m3-emv-plate/bid/queryBid')));
  check('Plate Center keeps the full official announcement list collapsed by default',await page.locator('#plateAnnouncementList').count()===1&&!(await page.locator('.plate-announcement-panel').getAttribute('open')));
  check('Plate Center names official open-data source',await page.locator('.plate-source-section').textContent().then(x=>x.includes('交通部公路局')&&x.includes('政府資料開放平臺')));
  check('Plate Center loads local official announcement cache',fs.readFileSync(path.join(root,'assets/plate.js'),'utf8').includes('./data/plates/announcements.json'));
  check('Plate Center quick actions stay inside COLA GO',await page.locator('.plate-quick-actions [data-url]').count()===0);
  check('Plate Center has in-site detail dialog',await page.locator('#plateDetailDialog').count()===1);
  check('Plate Center reserves external navigation for formal actions',fs.readFileSync(path.join(root,'assets/plate.js'),'utf8').includes('正式競標'));
  check('Plate Center keeps notification capability controls available inside collapsed settings',await page.locator('#plateNotifyCapability').count()===1&&await page.locator('#plateNotifyPush').count()===1);
  check('Plate Center keeps notification test control available',await page.locator('#plateTestNotify').count()===1);
  check('Plate Center LINE notification client keeps sensitive auction fields local',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('function lineNotifyProfile()')&&src.includes('plates,')&&src.includes('primaryPlate:')&&!src.slice(src.indexOf('function lineNotifyProfile()'),src.indexOf('function lineNotifyApiBase()')).includes('budget')&&!src.slice(src.indexOf('function lineNotifyProfile()'),src.indexOf('function lineNotifyApiBase()')).includes('current');})());
  check('Plate Center LINE pairing is explicit, one-shot and never background polls',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('startLineNotifyPairing')&&src.includes('checkLineNotifyPairing')&&src.includes('/v1/plate-line/pairings')&&src.includes('網站不會背景輪詢')&&!src.includes('setInterval(checkLineNotifyPairing');})());
  check('Plate Center LINE UI enables secure pairing after backend configuration',await page.locator('#plateLineNotifyPanel').count()===1&&await page.waitForFunction(()=>document.querySelector('#plateLineStatus')?.textContent.includes('可綁定'))&&!(await page.locator('#plateLineBind').isDisabled())&&(()=>{const cfg=JSON.parse(fs.readFileSync(path.join(root,'data/line-notify.json'),'utf8'));return cfg.enabled===true&&cfg.apiBase.includes('/functions/v1/cola-go-line');})());
  check('Plate Center LINE client validates backend and LINE handoff URLs before use',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('url.protocol!=="https:"&&url.origin!==location.origin')&&src.includes('["line.me","www.line.me","lin.ee"].includes(url.hostname)');})());
  check('Plate Center LINE integration contains no channel token or channel secret',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8')+fs.readFileSync(path.join(root,'data/line-notify.json'),'utf8');return !/channel[_ -]?(access[_ -]?token|secret)/i.test(src);})());
  check('Plate Center V13 is number-first and compact by default',await page.locator('.plate-number-first').isVisible()&&await page.locator('#plateCandidate').getAttribute('inputmode').then(x=>x==='numeric')&&!(await page.locator('.plate-announcement-panel').getAttribute('open'))&&!(await page.locator('.plate-notify-details').getAttribute('open')));
  check('Plate Center normalizes full plates to numeric nationwide watch targets',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('function watchNumber(value)')&&src.includes('watchNumber(row.plate)||normalize(row.plate)')&&src.includes('plate=watchNumber(plate)||normalize(plate)');})());
  check('Plate Center numeric watches use prefix-agnostic official range matching',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('if(q.prefix&&q.prefix!==a.prefix&&q.prefix!==b.prefix)return false')&&src.includes('return q.number>=Math.min(a.number,b.number)&&q.number<=Math.max(a.number,b.number)');})());
  check('Plate Center defaults nationwide watches to private cars and keeps all-vehicle mode advanced',await page.locator('#plateVehicleScope').count()===1&&await page.locator('#plateVehicleScope').inputValue().then(x=>x==='private-car')&&(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('function categoryMatchesScope(')&&src.includes('"自用小客貨車"')&&src.includes('"電動自小客"')&&src.includes('vehicleScope:loadVehicleScope()');})());
  check('Plate Center migrates old LINE bindings to numeric vehicle-scoped profiles once',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('LINE_NOTIFY_PROFILE_VERSION="2"')&&src.includes('saveLineNotifyProfileVersion()')&&src.includes('LINE 綁定已失效，請重新綁定');})());
  check('Plate Center candidate changes auto-sync to an existing LINE binding',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('function scheduleLineNotifySync()')&&src.includes('syncLineNotifySubscription({silent:true})')&&src.includes('watchNumber(row.plate)||normalize(row.plate)');})());
  check('Plate Center visible candidate cards emphasize nationwide number tracking',await page.locator('#plateWatchList .plate-number-card').first().textContent().then(x=>x.includes('全台不限英文字母')&&x.includes('不限監理站')));
  check('Plate Center prefers the fresh server-side official announcement cache with static fallback',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('/v1/plate-line/announcements')&&src.includes('urls.push(ANNOUNCEMENT_URL+"?v="+Date.now())')&&src.includes('loadLineNotifyConfig().finally(()=>loadAnnouncements())');})());
  check('Plate Center V14 renders official exact-number confirmation above collapsed ranges',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');const css=fs.readFileSync(path.join(root,'assets/plate.css'),'utf8');return src.includes('/v1/plate-line/confirm?number=')&&src.includes('官方明細已確認')&&src.includes('data-plate-search-action="official-exact"')&&src.includes('plate-range-preview')&&css.includes('.plate-exact-card');})());
  check('Plate Center V14 exact official handoff copies the full plate before opening MVDIS',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('if(action==="official-exact"){openOfficialBidFor(value);return}')&&src.includes('已複製，請到官方頁完成正式競標');})());
  check('V16 secondary content is progressive disclosure by default',(()=>{const html=fs.readFileSync(path.join(root,'index.html'),'utf8');return ['shortcut-install','shortcut-automation-guide','tesla-test','shortcut-auto-setup','charging-maps','parking-maps','cctv-official','partner-types'].every(id=>html.includes('data-ui-panel="'+id+'"'))&&!/<details\\b[^>]*\\bopen(?:=| |>)/.test(html);})());
  check('V16 returning to a page collapses secondary panels again',(()=>{const src=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return src.includes('function resetViewDisclosures(view)')&&src.includes('resetViewDisclosures(view);')&&src.includes('function bindDisclosureBehavior()');})());
  check('V16 keeps one peer disclosure open at a time without collapsing nested parents',(()=>{const src=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return src.includes('other.contains(current)||current.contains(other)')&&src.includes('other.open=false');})());
  check('V16 uses four consistent control-size tiers',(()=>{const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');const plate=fs.readFileSync(path.join(root,'assets/plate.css'),'utf8');return css.includes('--ui-primary-h:48px')&&css.includes('--ui-control-h:44px')&&css.includes('--ui-chip-h:38px')&&css.includes('--ui-compact-h:36px')&&plate.includes('Plate Center uses the same control scale');})());
  check('V18 navigation and disclosure use querySelectorAll at runtime',(()=>{const src=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const a=src.slice(src.indexOf('function resetViewDisclosures'),src.indexOf('function bindExternal'));return a.includes('const root=$$(".view").find')&&a.includes('if(!$$(".view").some')&&a.includes('$$(".view").forEach')&&a.includes('$$("details",root).forEach')&&a.includes('$$("details",view).forEach')&&!a.includes('const root=$(".view").find');})());
  check('V18 traffic and parking freshness use timestamps',(()=>{const src=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');const rt=fs.readFileSync(path.join(root,'assets/tdx-runtime.js'),'utf8');return src.includes('function dataAgeInfo(')&&src.includes('function dataStatusInfo(')&&src.includes('最後剩餘')&&src.includes('資料較舊 · ')&&rt.includes('const info=dataStatusInfo(state.parkingRemote)');})());
  check('V18 charging live details stay collapsed',(()=>{const src=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return src.includes('return \'<details class="charging-live-detail">\'')&&!src.includes("counts.fault>0?' open'");})());
  check('V18 plate vehicle scope is rendered, not shown as source code',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes("不限監理站・'+escPlate(vehicleScopeLabel())+'")&&!src.includes('不限監理站・escPlate(vehicleScopeLabel())');})());
  check('V18 exact-plate failure is explicit',(()=>{const src=fs.readFileSync(path.join(root,'assets/plate.js'),'utf8');return src.includes('精準確認暫不可用')&&src.includes('官方實牌確認暫時無法完成');})());
  check('V19 CCTV groups start collapsed',(()=>{const src=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');return src.includes('return \'<details class="cctv-group"><summary>\'')&&!src.includes("index===0?' open':'");})());
  check('V19 official CCTV cache keeps its update timestamp',(()=>{const src=fs.readFileSync(path.join(root,'assets/tdx-runtime.js'),'utf8');return src.includes('updatedAt:data.updatedAt||data.liveUpdatedAt||null');})());
  check('V19 key charging touch targets meet compact mobile minimums',(()=>{const css=fs.readFileSync(path.join(root,'assets/styles.css'),'utf8');return css.includes('.charging-city-primary select{min-height:44px}')&&css.includes('.favorite-btn{width:40px;height:40px;min-height:40px')&&css.includes('#chargingResultClear{min-height:36px');})());
  const plateWorkerSource=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  check('PWA service worker handles plate push and notification clicks',plateWorkerSource.includes('addEventListener("push"')&&plateWorkerSource.includes('addEventListener("notificationclick"')&&plateWorkerSource.includes('./#plate'));
  await page.evaluate(()=>navigator.serviceWorker.ready);
  const cached=await page.evaluate(async()=>{const cache=await caches.open('cola-go-ui-v6-42');return (await cache.keys()).map(x=>new URL(x.url).pathname);});
  check('PWA caches all five local visual assets',['drive-hero','tunnel','trip-road','trip-parking','trip-charging'].every(name=>cached.includes(`/assets/images/${name}.webp`)));
  check('TDX official cache is network-only in service worker',fs.readFileSync(path.join(root,'sw.js'),'utf8').includes('u.pathname.includes("/data/tdx/")')&&!cached.some(pathname=>pathname.includes('/data/tdx/')));
  await page.evaluate(()=>sessionStorage.setItem('cola-go-ui-v6-qa-offline','on'));
  try{
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(()=>document.querySelectorAll('#chargingList article').length>0);
    const offlineCharging=JSON.parse(fs.readFileSync(path.join(root,'data/charging.json'),'utf8'));
    check('Offline reload retains bundled charging data without live feeds',await page.evaluate(expected=>JSON.stringify(state.charging)===JSON.stringify(expected),offlineCharging));
    check('Offline hero loads from cache',await page.locator('.hero-photo').evaluate(x=>x.complete&&x.naturalWidth>0));
    check('No uncaught browser JavaScript errors',errors.length===0);
  }finally{
    await context.setOffline(false);
    await page.evaluate(()=>sessionStorage.removeItem('cola-go-ui-v6-qa-offline'));
  }
  const report={browser:browser.version(),viewports:[390,430,1440],checks:results.length,passed:results,errors,externalNetwork:'blocked; checked-in data plus explicitly labelled charging/CCTV QA fixtures',fontSetup:fontCSS?'QA-only embedded Noto Sans TC; product CSS unchanged':'system fonts'};
  fs.writeFileSync(path.join(root,'docs/ui-v6/verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`PASS ${results.length} checks; screenshots: ${output}`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});