// Verifica que cada plantilla del prototipo produzca los campos correctos.
//
//   node design/verifica-campos.js
//
// No hay navegador aquí, así que monta un sustituto mínimo del DOM, carga el
// script del prototipo y recorre las plantillas imprimiendo qué campos sale a
// llenar el coach en cada fila.
//
// Lo que reprueba, y por qué:
//   - Series en un bloque de cardio, WOD o Hyrox: ahí la prescripción la manda
//     el formato o la sesión, no un número de series por movimiento.
//   - RPE por serie en cardio: el esfuerzo ahí se mide por zona o por ritmo.
//   - Carga en algo que solo se corre.
// La carga en un trineo o en un acarreo SÍ va: es el punto de la estación. La
// primera versión de este guion la reprobaba y el equivocado era el guion.

// Sustituto del DOM, ahora con createElement, body y querySelectorAll de verdad
// para poder ejercitar el menú flotante y los grupos.
const hechos = new Map();
function nuevoNodo(id) {
  const n = {
    id, _html: '', value: '', textContent: '', checked: false, disabled: false,
    className: '', offsetWidth: 200, offsetHeight: 180,
    style: new Proxy({}, { get: () => '', set: () => true }),
    dataset: {}, selectedOptions: [{ textContent: 'Diego Salas' }],
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    get innerHTML(){ return this._html; },
    set innerHTML(v){ this._html = String(v); },
    querySelectorAll: () => [],
    querySelector: () => null,
    getBoundingClientRect: () => ({ left: 100, top: 100, right: 300, bottom: 140 }),
    appendChild(){}, remove(){}, focus(){}, addEventListener(){},
    set onclick(f){}, set oninput(f){}, set onchange(f){},
  };
  return n;
}
function nodo(id) {
  if (!hechos.has(id)) hechos.set(id, nuevoNodo(id));
  return hechos.get(id);
}
// Las casillas del grupo: tres marcadas, para que marcados() devuelva algo.
const casillas = [0,1,2,3,4,5].map(i => {
  const c = nuevoNodo('chk' + i);
  c.value = String(i); c.checked = i < 3;
  return c;
});
global.document = {
  getElementById: nodo,
  createElement: () => nuevoNodo('creado'),
  body: { appendChild(){}, removeChild(){} },
  addEventListener(){}, removeEventListener(){},
  querySelectorAll: (sel) => {
    if (sel.includes('#grLista input')) return sel.includes(':checked')
      ? casillas.filter(c => c.checked) : casillas;
    if (sel.includes('#bDis')) return [];
    return [];
  },
  querySelector: (sel) => sel.includes('#bDis') ? nuevoNodo('chip') : null,
};
global.window = { innerHeight: 900, innerWidth: 1440 };
global.setTimeout = (f) => { try { f(); } catch (e) { console.error('  setTimeout:', e.message); } };
global.clearTimeout = () => {};
global.confirm = () => true;
global.prompt = () => 'https://www.youtube.com/watch?v=abc12345';
global.alert = () => {};


const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'web-coach.html'), 'utf8');
const src = html.match(/<script>([\s\S]*)<\/script>/)[1];
const api = new Function(src + "\n;return {TEMPLATES, bloquesDe, resumenDe};")();

let fallos = 0;
for (const t of api.TEMPLATES){
  console.log(`\n■ ${t.n}   (${api.resumenDe(t)})`);
  for (const b of api.bloquesDe(t)){
    if (b.kind === 'texto'){ console.log(`   ▸ ${b.n}: «${b.body.slice(0,44)}…»`); continue; }
    console.log(`   ▸ ${b.n}${b.fmt ? ' [' + b.fmt + ']' : ''}`);
    for (const e of b.ex){
      const campos = e.f.map(([k]) => k).join(' · ');
      // Lo que de verdad no debe pasar:
      //  - Series en cardio, WOD o Hyrox: ahí la prescripción la manda el
      //    formato o la sesión, no un número de series por movimiento.
      //  - RPE por serie en cardio: el esfuerzo ahí se mide por zona o ritmo.
      //  - Carga en algo que solo se corre.
      // La carga en un trineo o en un acarreo SÍ va: es el punto de la estación.
      const mandaElBloque = ['Cardio','WOD / Metcon','Estaciones Hyrox'].includes(b.n);
      const soloCorre = /^(Correr|Rodaje|Trote|Tempo|Intervalos)/.test(e.n);
      const mal = (mandaElBloque && /Series/.test(campos))
        || (b.n === 'Cardio' && /RPE/.test(campos))
        || (soloCorre && /Carga \(kg\)/.test(campos));
      if (mal) fallos++;
      console.log(`      ${mal ? '✗' : '·'} ${e.n.padEnd(24)} → ${campos}`);
    }
  }
}
console.log(fallos ? `\n✗ ${fallos} filas con campos de gimnasio donde no van` : '\n✓ ninguna fila con campos equivocados');
process.exit(fallos ? 1 : 0);
