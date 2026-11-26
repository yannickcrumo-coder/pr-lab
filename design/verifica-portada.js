// Verifica las tres rutas de la portada.
//
//   node design/verifica-portada.js
//
// No hay navegador aquí, así que monta un DOM mínimo y dobles de GSAP y Lenis
// que registran lo que se les pide. Lo que comprueba:
//
//   1. Con movimiento reducido NO se enciende Lenis, no se crea ni un tween y
//      no se añade la clase `anima`. Esta es la que importa: una página que
//      promete respetar la preferencia y no la respeta es peor que una sin
//      animación.
//   2. Con movimiento completo sí, y además Lenis queda amarrado a
//      ScrollTrigger: escucha su scroll, avanza con el reloj de GSAP y el
//      suavizado de retraso queda en 0. Sin ese amarre las animaciones se
//      disparan donde no.
//   3. Sin GSAP —CDN bloqueado— la clase `anima` NO se añade, así que el CSS
//      deja todo visible. Al revés, una falla de red dejaría la página en
//      blanco, que es el error clásico de este estilo de página.

// Comprueba lo que de verdad importa de esta página:
//  1. Con movimiento reducido NO se enciende Lenis ni se anima.
//  2. Con movimiento completo sí, y ScrollTrigger queda amarrado a Lenis.
//  3. Sin GSAP del CDN, la página NO queda invisible.
let clases = new Set();
const hechos = new Map();
function nodo(id){
  if (hechos.has(id)) return hechos.get(id);
  const n = { id, _h:'', textContent:'', dataset:{}, childNodes:[],
    style:new Proxy({},{get:()=>'',set:()=>true}),
    classList:{ add(){}, remove(){}, toggle(){}, contains:()=>false },
    get innerHTML(){return this._h}, set innerHTML(v){this._h=String(v)},
    getContext:()=>({ setTransform(){},clearRect(){},beginPath(){},arc(){},fill(){},
      set fillStyle(v){} }),
    parentElement:{ getBoundingClientRect:()=>({width:1200,height:800}) },
    getBoundingClientRect:()=>({width:1200,height:800,top:0,left:0}),
    querySelectorAll:()=>[], closest:()=>null, addEventListener(){},
    set onclick(f){ this._click=f }, get onclick(){ return this._click } };
  hechos.set(id,n); return n;
}
global.document = {
  documentElement:{ classList:{ add:c=>clases.add(c), remove:c=>clases.delete(c),
    toggle(){}, contains:c=>clases.has(c) } },
  getElementById:nodo, querySelector:()=>null, querySelectorAll:()=>[],
  addEventListener(){}, readyState:'complete',
};
let reducePref = false;
global.window = {
  matchMedia:(q)=>({ matches:q.includes('reduce') && reducePref, addEventListener(){} }),
  devicePixelRatio:1, innerWidth:1200, innerHeight:800,
  addEventListener(){}, removeEventListener(){},
};
global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = () => {};

// --- dobles de GSAP y Lenis que registran lo que se les pide
function hacerDobles(){
  const reg = { tweens:0, scrollTriggers:0, tickerAdds:0, lagSmoothing:null,
    lenisCreado:0, lenisEscucha:0, lenisDestruido:0 };
  const tween = { kill(){}, timeScale(){} };
  const tl = { to(){return tl}, fromTo(){reg.tweens++;return tl} };
  tl.to = () => { reg.tweens++; return tl; };
  global.window.gsap = {
    registerPlugin(){}, context:(fn)=>{ fn(); return { revert(){} }; },
    timeline:()=>tl, to:()=>{reg.tweens++;return tween},
    fromTo:()=>{reg.tweens++;return tween}, set(){},
    utils:{ toArray:()=>[] },
    ticker:{ add:()=>reg.tickerAdds++, remove(){}, lagSmoothing:(a)=>{reg.lagSmoothing=a} },
  };
  global.window.ScrollTrigger = {
    create:()=>{reg.scrollTriggers++;}, getAll:()=>[], update(){}, refresh(){},
  };
  global.window.Lenis = class {
    constructor(){ reg.lenisCreado++; }
    on(){ reg.lenisEscucha++; } off(){} raf(){} destroy(){ reg.lenisDestruido++; }
    scrollTo(){}
  };
  return reg;
}

const fs = require('fs'), path = require('path'), re = /<script>\n([\s\S]*)<\/script>/;
const html = fs.readFileSync(path.join(__dirname, 'portada.html'), 'utf8');
const fuente = html.match(re)[1];

function correr(etiqueta, { reduce, conGsap }){
  clases = new Set(); hechos.clear(); reducePref = reduce;
  const reg = hacerDobles();
  if (!conGsap){ delete global.window.gsap; delete global.window.ScrollTrigger;
                 delete global.window.Lenis; }
  new Function(fuente)();
  const anima = clases.has('anima');
  console.log(`\n■ ${etiqueta}`);
  console.log(`   clase 'anima' en <html>: ${anima}`);
  console.log(`   tweens creados: ${reg.tweens}   scrollTriggers: ${reg.scrollTriggers}`);
  console.log(`   Lenis instanciado: ${reg.lenisCreado}   escucha a ScrollTrigger: ${reg.lenisEscucha}`);
  console.log(`   gsap.ticker.add: ${reg.tickerAdds}   lagSmoothing: ${reg.lagSmoothing}`);
  console.log(`   nota: ${nodo('movNota').textContent.slice(0,78)}`);
  if (nodo('avisoCDN').textContent) console.log(`   aviso: ${nodo('avisoCDN').textContent.slice(0,80)}`);
  return { anima, reg };
}

const fallos = [];
const a = correr('Movimiento reducido (el sistema lo pide)', { reduce:true,  conGsap:true });
if (a.anima)              fallos.push('con movimiento reducido añadió la clase anima');
if (a.reg.lenisCreado)    fallos.push('con movimiento reducido encendió Lenis');
if (a.reg.tweens)         fallos.push('con movimiento reducido creó tweens');

const b = correr('Movimiento completo', { reduce:false, conGsap:true });
if (!b.anima)             fallos.push('con movimiento completo no añadió la clase anima');
if (!b.reg.lenisCreado)   fallos.push('con movimiento completo no encendió Lenis');
if (!b.reg.lenisEscucha)  fallos.push('Lenis no quedó amarrado a ScrollTrigger');
if (!b.reg.tickerAdds)    fallos.push('Lenis no avanza con el reloj de GSAP');
if (b.reg.lagSmoothing !== 0) fallos.push('no desactivó el suavizado de retraso');

const c = correr('Sin GSAP (CDN bloqueado)', { reduce:false, conGsap:false });
if (c.anima)              fallos.push('sin GSAP añadió la clase anima y dejaría todo invisible');

console.log(fallos.length ? '\n✗ ' + fallos.length + ':\n   ' + fallos.join('\n   ')
  : '\n✓ las tres rutas se comportan como deben');
process.exit(fallos.length ? 1 : 0);
