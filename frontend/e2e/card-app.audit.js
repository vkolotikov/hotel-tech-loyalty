// Run in a fresh local-fixture page after card-app.browser.js.
async page => {
  const origin = new URL(page.url()).origin;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):(5173|5810)$/.test(origin)) throw Error('Local fixtures required');
  const root = 'C:/wamp64/www/Hexa-Tech/docs/loyalty-redesign/evidence/card-app/';
  const checks = [], ok = (value, name) => { if (!value) throw Error(name); checks.push(name); };
  const inspect = () => page.evaluate(() => {
    const host = document.querySelector('[data-overview]'), css = getComputedStyle(host);
    const token = name => css.getPropertyValue('--l-ov-' + name).trim();
    const rgb = hex => { if (hex.length === 4) hex = '#' + [...hex.slice(1)].map(c => c+c).join(''); return [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255); };
    const lum = hex => rgb(hex).map(x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4).reduce((s,x,i) => s+x*[.2126,.7152,.0722][i],0);
    const contrast = (a,b) => (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
    const colors = ['text','secondary','muted','cyan'].flatMap(foreground => ['raised','bottom','recessed','canvas'].map(background => ({foreground,background,ratio:contrast(token(foreground),token(background))})));
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
    const icons = [...document.querySelectorAll('.l-ov-nav .l-ov-icon img')].map(e => ({src:e.getAttribute('src'),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,loaded:e.complete&&e.naturalWidth>0}));
    return {theme:host.dataset.theme,colors,sidebar:rect('.l-ov-sidebar'),header:rect('.l-ov-topbar'),editor:rect('.l-ca-editor'),preview:rect('.l-ca-preview'),columns:getComputedStyle(document.querySelector('.l-ca-columns')).gridTemplateColumns,font:getComputedStyle(document.querySelector('h1')).fontFamily,fontLoaded:document.fonts.check('600 30px "L Poppins"'),icons,primaryLabelContrast:contrast('#f5f7fb','#4b4ced')};
  });
  await page.setViewportSize({width:1440,height:1080});
  await page.evaluate(() => document.fonts.ready);
  const dark = await inspect();
  ok(Math.abs(dark.sidebar.width-232)<1 && Math.abs(dark.header.height-72)<1,'Figma sidebar 232 and header 72');
  ok(Math.abs(dark.editor.width-664)<1 && Math.abs(dark.preview.width-464)<1 && Math.abs(dark.preview.x-dark.editor.x-dark.editor.width-16)<1,'Figma columns 664 / 16 / 464');
  ok(dark.fontLoaded && dark.font.includes('L Poppins'),'actual local Poppins loaded');
  ok(dark.icons.length>=9 && dark.icons.every(i=>i.loaded&&i.width===20&&i.height===20),'exported navigation icons retain 20px geometry');
  ok(dark.colors.every(c=>c.ratio>=4.5),'dark editor text meets 4.5 across gradient endpoints and fields');
  ok(dark.primaryLabelContrast>=4.5,'primary label region below the cyan highlight meets 4.5');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('group',{name:'Theme',exact:true}).getByRole('button',{name:'Light',exact:true}).click();
  await page.keyboard.press('Escape');
  const light = await inspect();
  ok(light.colors.every(c=>c.ratio>=4.5),'light editor text meets 4.5 across gradient endpoints and fields');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('group',{name:'Theme',exact:true}).getByRole('button',{name:'Dark',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:root+'render-mobile-viewport.png'});
  await page.locator('.l-ca-preview').screenshot({path:root+'render-mobile-preview.png'});
  ok(await page.locator('.l-ca-columns').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length===1),'mobile columns actually stack');
  await page.setViewportSize({width:720,height:540});
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'200 percent equivalent viewport reflows');
  await page.getByRole('button',{name:'Show code',exact:true}).click();
  await page.keyboard.press('Tab');
  ok(await page.locator('dialog[open]').evaluate(e=>e.contains(document.activeElement)),'keyboard focus stays in modal');
  await page.keyboard.press('Escape');
  ok(await page.getByRole('button',{name:'Show code',exact:true}).evaluate(e=>e===document.activeElement),'Escape restores keyboard focus');
  return {passed:checks.length,checks,dark,light,notes:['Preview colours intentionally reflect user-supplied appearance; arbitrary palettes are not guaranteed accessible.','Primary-button cyan highlight ends above the text region.']};
}
