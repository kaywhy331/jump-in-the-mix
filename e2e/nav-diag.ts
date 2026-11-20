import type { Page } from '@playwright/test';
export async function installNavDiag(page: Page) {
 await page.addInitScript(() => {
  const events: object[] = [];
  const target = (e: EventTarget | null): string => {
   if (!(e instanceof Element)) return String(e);
   return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + String(e.className).slice(0,90) + ['data-workflow-port','data-workflow-step','data-pager-pane','aria-label'].map(k => e.hasAttribute(k) ? `[${k}=${e.getAttribute(k)}]` : '').join('');
  };
  const state = () => Array.from(document.querySelectorAll<HTMLElement>('.scroll-pager-track')).map(t => ({left:+t.scrollLeft.toFixed(2), width:t.clientWidth,overflow:t.style.overflowX,selected:t.querySelector('[data-pager-selected]')?.getAttribute('data-pager-pane'), panels:Array.from(t.children).map(p=>({id:p.getAttribute('data-pager-pane'),x:+p.getBoundingClientRect().x.toFixed(1),w:+p.getBoundingClientRect().width.toFixed(1)}))}));
  const record = (event: string, data: object = {}) => {events.push({t:+performance.now().toFixed(1),event,...data}); if(events.length>2000)events.shift();};
  Object.assign(window,{__navDiag:record,__navEvents:events});
  for(const name of ['pointerdown','pointerup','pointermove','pointercancel','touchstart','touchmove','touchend','touchcancel','focusin']) document.addEventListener(name,e=>{
   const t=e instanceof TouchEvent ? e.touches[0]??e.changedTouches[0] : e instanceof PointerEvent ? e : null;
   record(name,{target:target(e.target),x:t?.clientX,y:t?.clientY,hit:t?target(document.elementFromPoint(t.clientX,t.clientY)):null,prevented:e.defaultPrevented,ports: name==='pointerup'||name==='pointerdown' ? Array.from(document.querySelectorAll('[data-workflow-port]')).map(p=>({target:target(p),rect:p.getBoundingClientRect().toJSON()})) : undefined,tracks:state()});
  },{capture:true,passive:true});
  const focus=HTMLElement.prototype.focus; HTMLElement.prototype.focus=function(options){record('focus',{target:target(this),options,stack:new Error().stack?.split('\n').slice(2,5),tracks:state()});return focus.call(this,options);};
  const scroll=Element.prototype.scrollIntoView; Element.prototype.scrollIntoView=function(options){record('scrollIntoView',{target:target(this),options,stack:new Error().stack?.split('\n').slice(2,5),tracks:state()});return scroll.call(this,options);};
  const scrollTo=Element.prototype.scrollTo; Element.prototype.scrollTo=function(...args: [number,number] | [ScrollToOptions?]){record('scrollTo',{target:target(this),args,stack:new Error().stack?.split('\n').slice(2,5),tracks:state()});return Reflect.apply(scrollTo,this,args);};
  document.addEventListener('scroll',e=>{if(e.target instanceof Element && (e.target.matches('.scroll-pager-track')||e.target.hasAttribute('data-pager-pane'))) record('dom-scroll',{target:target(e.target),left:e.target.scrollLeft,top:e.target.scrollTop,tracks:state()});},true);
  let previous=''; const sample=()=>{const next=JSON.stringify(state());if(next!==previous){record('frame',{tracks:JSON.parse(next)});previous=next;}requestAnimationFrame(sample);};requestAnimationFrame(sample);
 });
}
export async function navTrace(page: Page) {
 return page.evaluate(() => JSON.stringify((window as unknown as {__navEvents:Record<string, unknown>[]}).__navEvents?.slice(-600).map(e => ({...e,tracks: Array.isArray(e.tracks) ? e.tracks.map(t => ({left:t.left,selected:t.selected,overflow:t.overflow})) : undefined}))));
}
