// Run after each section's local browser fixture. No live API requests.
async (page, {base, root, routes}) => {
  const results=[];
  for(const [name,path] of routes) {
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1080});
      await page.goto(base+path);
      await page.waitForLoadState('networkidle');
      await page.evaluate(()=>document.fonts.ready);
      const result=await page.evaluate(()=>{
        const main=document.querySelector('main'),heading=main?.querySelector('h1'),frame=document.querySelector('[data-loyalty]');
        return {title:heading?.textContent,font:heading&&getComputedStyle(heading).fontFamily,frame:frame?.className,overflow:document.documentElement.scrollWidth>innerWidth+1,errors:main?.textContent?.includes('Something went wrong'),panels:[...document.querySelectorAll('main .l-ov-panel')].map(p=>({width:Math.round(p.getBoundingClientRect().width),height:Math.round(p.getBoundingClientRect().height)}))};
      });
      await page.screenshot({path:root+'audit-'+name+'-'+width+'.png',fullPage:false});
      results.push({name,path,width,...result});
      if(!result.title||!result.font?.includes('Poppins')||result.overflow||result.errors)throw new Error('Style audit failed: '+JSON.stringify(results.at(-1)));
    }
  }
  return results;
}
