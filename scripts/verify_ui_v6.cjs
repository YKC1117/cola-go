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
  check('Charging driver-first controls are visible',await page.locator('#chargingFindNow').isVisible()&&await page.locator('#chargingNearby').isVisible()&&await page.locator('#chargingAvailableOnly').isVisible()&&await page.locator('#chargingCity').isVisible()&&await page.locator('#chargingSearch').isVisible());
  check('Six primary charging networks are first-layer controls',await page.locator('#chargingMajorFilter [data-charge-major]').evaluateAll(nodes=>nodes.map(n=>n.dataset.chargeMajor).join(',')==='all,evoasis,upower,tail,evalue,icharging,tesla'));
  await page.waitForFunction(()=>[...document.querySelectorAll('#chargingMajorFilter [data-major-status]')].every(el=>/站/.test(el.textContent||'')));
  check('Major network controls expose station and live counts',await page.locator('#chargingMajorFilter [data-major-status]').evaluateAll(nodes=>nodes.length===7&&nodes.every(n=>n.textContent.includes('站'))));
  check('Major network source semantics stay visible',await page.locator('.charging-network-legend').textContent().then(x=>x.includes('TDX')&&x.includes('即時')));
  await page.waitForFunction(()=>document.querySelectorAll('#chargingCoverageGrid [data-coverage-major]').length===6);
  await page.waitForFunction(()=>state.charging.some(x=>x.officialSupplemental&&x.networkKey==='evalue'),{timeout:12000}).catch(()=>{});
  check('EVALUE official source is loaded when available',await page.evaluate(()=>state.charging.some(x=>x.networkKey==='evalue')));
  check('Coverage panel reports all six primary networks',await page.locator('#chargingCoverageGrid [data-coverage-major]').evaluateAll(nodes=>nodes.map(n=>n.dataset.coverageMajor).join(',')==='evoasis,upower,tail,evalue,icharging,tesla'));
  check('Coverage panel exposes operator source health state',await page.locator('#chargingCoverageGrid').evaluate(el=>el.dataset.sourceHealth.split(',').filter(Boolean).length>=4));
  check('Coverage panel explains live and official supplemental semantics',await page.locator('#chargingCoverage').textContent().then(x=>x.includes('即時')&&x.includes('官方補')));
  check('Charging cards expose decision-first availability',await page.locator('#chargingList .charging-availability-main').first().isVisible());
  check('Charging cards surface compact rate information when TDX provides it',await page.locator('#chargingList .charging-rate').count()>0);
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
  check('iCharging current official rate hint is present',await page.evaluate(()=>CHARGING_OPERATOR_PROFILES.find(x=>x.key==='icharging')?.rateHint.includes('9.2–10 元/度')));
  check('Tesla guidance never claims website list is live availability',await page.evaluate(()=>CHARGING_OPERATOR_PROFILES.find(x=>x.key==='tesla')?.networkHint.includes('不把官方網站清單假裝成即時空槍')));
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
  await firstNav.click();
  await page.locator('#chargingList [data-charge-google]').first().click();
  check('Charging Google navigation prefers lat/lon coordinates',await page.evaluate(()=>{
    const u=new URL(window.__opened.at(-1)); return /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(u.searchParams.get('destination')||'');
  }));
  await page.locator('#chargingList [data-charge-apple]').first().click();
  check('Charging Apple navigation prefers lat/lon coordinates',await page.evaluate(()=>{
    const u=new URL(window.__opened.at(-1)); return /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(u.searchParams.get('daddr')||'');
  }));
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
  check('Verified shortcut file URLs are exposed',JSON.stringify(await page.locator('.shortcut-file-download').evaluateAll(a=>a.map(x=>new URL(x.href).pathname)))===JSON.stringify(['/downloads/oil-driver.shortcut','/downloads/tesla-driver.shortcut']));
  check('Verified shortcut download filenames are explicit',JSON.stringify(await page.locator('.shortcut-file-download').evaluateAll(a=>a.map(x=>x.getAttribute('download'))))===JSON.stringify(['油車助手.shortcut','特斯拉助手.shortcut']));
  check('Oil v1.3 signed file hash matches verified build',crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'downloads/oil-driver.shortcut'))).digest('hex')==='5c93e0962c98fae03e5590608332e6571912406b98d021ed87ad5e10d1ec836b');
  check('Tesla v1.6 signed file hash matches verified build',crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'downloads/tesla-driver.shortcut'))).digest('hex')==='9288fe2d90db62258d43a10ba6b007b766bd94d848d15ced2b5a917bb6179438');
  check('Personal iCloud shortcut links are removed',await page.locator('a[href*="icloud.com/shortcuts/"]').count()===0);
  check('CarKit cards contain no legacy iCloud controls',await page.locator('.shortcut-icloud').count()===0);
  check('Oil card documents v1.3 Shield plus JiXing',await page.locator('.shortcut-card').filter({hasText:'油車助手'}).textContent().then(x=>x.includes('v1.3')&&x.includes('神盾')&&x.includes('極行')));
  check('Tesla card documents v1.6 driving tools',await page.locator('.shortcut-card').filter({hasText:'特斯拉助手'}).textContent().then(x=>x.includes('v1.6')&&x.includes('神盾')&&x.includes('極行')&&x.includes('高速公路1968')&&x.includes('Tesla App')));
  check('Tesla real-car report copy button is visible',await page.locator('#copyTeslaReportBtn').isVisible());
  check('Oil validation status is explicit',await page.locator('.shortcut-card').filter({hasText:'油車助手'}).locator('.shortcut-proof').textContent().then(x=>x.includes('已驗證：v1.3 iPhone 實機正常')&&x.includes('神盾／極行可開啟')&&x.includes('待實車：CarPlay／Bluetooth 上車自動觸發、不同品牌車機相容性')));
  check('Tesla validation status is explicit',await page.locator('.shortcut-card').filter({hasText:'特斯拉助手'}).locator('.shortcut-proof').textContent().then(x=>x.includes('已驗證：v1.6 iPhone 實機正常')&&x.includes('神盾／極行／高速公路1968／Tesla App')&&x.includes('待驗證：Tesla Bluetooth 自動觸發／實車遠端控制')));
  check('iOS 27 direct automation setup is explicit',await page.locator('.shortcut-automation').filter({hasText:'上車自動啟動｜只要設定一次'}).textContent().then(x=>x.includes('編輯')&&x.includes('自動化操作')&&x.includes('CarPlay')&&x.includes('Bluetooth')&&x.includes('允許鎖定時執行')&&!x.includes('動作選「執行捷徑」')));
  check('Oil setup deep link targets installed shortcut',await page.locator('.shortcut-card').filter({hasText:'油車助手'}).locator('.shortcut-setup-link').getAttribute('href').then(x=>x==='shortcuts://open-shortcut?name=%E6%B2%B9%E8%BB%8A%E5%8A%A9%E6%89%8B'));
  check('Tesla setup deep link targets installed shortcut',await page.locator('.shortcut-card').filter({hasText:'特斯拉助手'}).locator('.shortcut-setup-link').getAttribute('href').then(x=>x==='shortcuts://open-shortcut?name=%E7%89%B9%E6%96%AF%E6%8B%89%E5%8A%A9%E6%89%8B'));
  check('Tesla report template contains required fields',(await page.locator('#teslaReportTemplate').textContent()).includes('iPhone 型號：')&&(await page.locator('#teslaReportTemplate').textContent()).includes('Siri「特斯拉助手」：'));
  await page.locator('#copyTeslaReportBtn').click();
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('已複製 Tesla 實車回報格式'));
  check('Tesla report copy feedback appears',await page.locator('#toast').textContent().then(x=>x.includes('已複製 Tesla 實車回報格式')));
  await page.evaluate(()=>navigator.serviceWorker.ready);
  const cached=await page.evaluate(async()=>{const cache=await caches.open('cola-go-ui-v6-40');return (await cache.keys()).map(x=>new URL(x.url).pathname);});
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