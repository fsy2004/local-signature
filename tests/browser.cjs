// Requires an existing Playwright installation and Chromium/Edge. No web runtime dependencies.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs');
const target=process.env.TEST_URL||pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const qa=process.env.QA_DIR||path.resolve(__dirname,'../.qa');fs.mkdirSync(qa,{recursive:true});
async function pen(page,type,id,x,y,pressure=.5) {
  if(id===21) {
    const cdp=await page.context().newCDPSession(page);
    const eventType={pointerdown:'mousePressed',pointermove:'mouseMoved',pointerup:'mouseReleased'}[type];
    await cdp.send('Input.dispatchMouseEvent',{type:eventType,x,y,pointerType:'pen',button:'left',buttons:type==='pointerup'?0:1,force:pressure,clickCount:type==='pointermove'?0:1});
    await cdp.detach();return;
  }
  await page.locator('canvas').dispatchEvent(type,{pointerId:id,pointerType:'pen',clientX:x,clientY:y,pressure,buttons:type==='pointerup'?0:1,button:0});
}
async function draw(page,context,touch) {
  await page.locator('canvas').scrollIntoViewIfNeeded();
  const r=await page.locator('canvas').boundingBox();
  if(touch) {
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+40,y:r.y+65}]});
    for(let i=1;i<=28;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+40+i*6,y:r.y+65+25*Math.sin(i/3)}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  } else {
    await page.mouse.move(r.x+70,r.y+100);await page.mouse.down();
    for(let i=1;i<=36;i++) await page.mouse.move(r.x+70+i*8,r.y+100+35*Math.sin(i/4));
    await page.mouse.up();
  }
}
async function exportImage(page) {
  const event=page.waitForEvent('download');await page.locator('#save').click();
  const download=await event;
  const result=await page.locator('#result').getAttribute('src');
  const pixels=await page.locator('#result').evaluate(async img=>{
    await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
    const g=c.getContext('2d');g.drawImage(img,0,0);const d=g.getImageData(0,0,c.width,c.height).data;
    let ink=0,transparent=0,edge=0,minX=c.width,minY=c.height,maxX=0,maxY=0;
    for(let i=3;i<d.length;i+=4) {if(d[i]) {ink++;const p=(i-3)/4,x=p%c.width,y=Math.floor(p/c.width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(d[i]<255)edge++;}else transparent++;}
    return {width:c.width,height:c.height,ink,transparent,edge,minX,minY,maxX,maxY};
  });
  await page.locator('#close').click();return {result,pixels,name:download.suggestedFilename()};
}
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 const report=[];
 try {
 for(const [name,width,height,touch] of [['desktop',1280,1100,false],['phone',390,844,true],['tablet',820,1180,true]]) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1,acceptDownloads:true});
  const page=await context.newPage();const errors=[],requests=[];
  // OS share sheets cannot be operated headlessly; exercise the download fallback
  // first, then inject success/failure mocks only at the external share boundary.
  await page.addInitScript(()=>Object.defineProperty(navigator,'canShare',{value:()=>false,configurable:true}));
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(target);await context.setOffline(true); // The loaded page needs no network.
  assert(await page.locator('#save').isDisabled());
  assert(await page.locator('#white').isChecked());
  assert.equal(await page.locator('#surface').evaluate(e=>e.classList.contains('white')),true);
  await draw(page,context,touch);await page.locator('#filename').fill('作者签名.png');
  const white=await exportImage(page);assert.equal(white.pixels.transparent,0,'default export is opaque white');
  const whiteCorner=await page.evaluate(async url=>{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');const g=c.getContext('2d');g.drawImage(img,0,0);return Array.from(g.getImageData(0,0,1,1).data);},white.result);
  assert.deepEqual(whiteCorner,[255,255,255,255]);
  await page.locator('#transparent').check();
  const first=await exportImage(page);assert.equal(first.name,'作者签名.png');
  assert.equal(first.pixels.width,1600);assert(first.pixels.ink>0 && first.pixels.transparent>0 && first.pixels.edge>0);
  assert(first.pixels.minX>0 && first.pixels.minY>0 && first.pixels.maxX<1599,'crop has transparent margin');
  await page.locator('#white').uncheck();assert.equal((await exportImage(page)).result,first.result,'preview must not change PNG background');
  await page.locator('#undo').click();assert(await page.locator('#save').isDisabled());
  await page.locator('#redo').click();assert.equal((await exportImage(page)).result,first.result,'redo restores identical PNG');
  await page.setViewportSize({width:height,height:width});
  assert.equal((await exportImage(page)).result,first.result,'rotation preserves vector geometry');
  await page.locator('#focus').click();assert(await page.locator('#save').isHidden());
  await page.screenshot({path:path.join(qa,name+'-focus.png'),fullPage:true});
  await page.locator('#focus').click();assert.equal((await exportImage(page)).result,first.result);
  await page.locator('#trim').uncheck();const full=await exportImage(page);assert.equal(full.pixels.height,Math.round(full.pixels.width/1.6));
  assert(full.pixels.maxX-full.pixels.minX<first.pixels.maxX-first.pixels.minX,'crop removes empty space');
  await page.locator('#trim').check();
  await page.locator('#penOnly').check();await draw(page,context,touch);
  assert.equal((await exportImage(page)).result,first.result,'pen-only ignores finger and mouse');
  await page.locator('canvas').scrollIntoViewIfNeeded();const r=await page.locator('canvas').boundingBox();
  await pen(page,'pointerdown',21,r.x+70,r.y+70,.1);
  await pen(page,'pointermove',99,r.x+300,r.y+160,.9); // Foreign pointer ignored.
  await pen(page,'pointerup',99,r.x+300,r.y+160,0);
  await pen(page,'pointermove',21,r.x+120,r.y+95,.9);
  await pen(page,'pointerup',21,r.x+130,r.y+100,0);
  assert.notEqual((await exportImage(page)).result,first.result,'stylus draws');
  await page.locator('#undo').click();assert.equal((await exportImage(page)).result,first.result,'one pen is one undo');
  await page.locator('#penOnly').uncheck();
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{write:()=>Promise.reject(Error('denied'))},configurable:true});});
  await page.locator('#copy').click();await page.waitForFunction(()=>document.getElementById('preview').open);await page.locator('#close').click();
  // Mock only the OS share boundary; inspect the actual generated File.
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});
    Object.defineProperty(navigator,'share',{value:async ({files})=>{window.testShared={name:files[0].name,type:files[0].type,size:files[0].size};},configurable:true});
  });
  await page.locator('#share').click();const shared=await page.evaluate(()=>window.testShared);
  assert.equal(shared.name,'作者签名.png');assert.equal(shared.type,'image/png');assert(shared.size>100);
  await page.evaluate(()=>Object.defineProperty(navigator,'share',{value:()=>{throw new Error('blocked')},configurable:true}));
  const fallback=page.waitForEvent('download');await page.locator('#share').click();await fallback;await page.locator('#close').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  page.on('dialog',d=>d.accept());await page.locator('#clear').click();assert(await page.locator('#save').isDisabled());assert(await page.locator('#redo').isDisabled());
  await page.setViewportSize({width,height});await page.screenshot({path:path.join(qa,name+'.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert(requests.length<=(target.startsWith('https:')?1:0),'no external runtime requests');
  report.push({name,png:first.pixels,errors,requests,offlineAfterLoad:true});await context.close();
 }
 fs.writeFileSync(path.join(qa,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
