// Verifica que el alta de ejercicio guarde lo que el formulario captura.
//
//   node design/verifica-alta-ejercicio.js
//
// Simula el formulario con valores reales y comprueba que los diez campos
// lleguen al registro, que el enlace se guarde, y que los campos de la sesión
// salgan de las métricas que el coach marcó y no de un juego fijo.
//
// El formulario preguntaba nueve cosas y la biblioteca guardaba solo el
// nombre: todo lo demás se tiraba al guardar. Esta prueba existe para que no
// vuelva a pasar sin avisar.

// Simula el formulario de alta de ejercicio con valores reales y comprueba
// que lo guardado sea lo capturado, no un nombre pelón.
const hechos = new Map();
const VALORES = {
  neNombre:'Sled push a 50%', nePatron:'Monoestructural', neNivel:'Intermedio',
  neCue:'Empuja desde el pecho, pasos cortos.',
  neVideo:'https://www.youtube.com/watch?v=abc12345',
};
const PRENDIDOS = {
  neMetricas:['distance','time','load'], neDis:['hyrox'],
  neMusculos:['cuadriceps','gluteos','cuerpo_completo'], neEquipo:['trineo'],
};
function nodo(id){
  if (hechos.has(id)) return hechos.get(id);
  const n = { id, _html:'', value:VALORES[id] ?? '', textContent:'', checked:id==='neRM',
    className:'', offsetWidth:200, offsetHeight:180,
    style:new Proxy({},{get:()=>'',set:()=>true}), dataset:{},
    selectedOptions:[{textContent:'Diego Salas'}],
    classList:{add(){},remove(){},toggle(){},contains(){return false}},
    get innerHTML(){return this._html}, set innerHTML(v){this._html=String(v)},
    querySelectorAll(sel){
      const vs = PRENDIDOS[this.id] || [];
      return (sel.includes(':checked') || sel.includes('.on'))
        ? vs.map(v=>({dataset:{v}, classList:{add(){},remove(){},toggle(){}}}))
        : [];
    },
    querySelector:()=>null,
    getBoundingClientRect:()=>({left:0,top:0,right:100,bottom:40}),
    appendChild(){}, remove(){}, focus(){}, addEventListener(){},
    set onclick(f){}, set oninput(f){} };
  hechos.set(id,n); return n;
}
global.document = { getElementById:nodo, createElement:()=>nodo('x'),
  body:{appendChild(){}}, addEventListener(){},
  querySelectorAll:(sel)=>{ const m=sel.match(/#(\w+)/); return m?nodo(m[1]).querySelectorAll(sel):[]; },
  querySelector:()=>null };
global.window={innerHeight:900,innerWidth:1440};
global.setTimeout=f=>{try{f()}catch(e){}}; global.clearTimeout=()=>{};
global.confirm=()=>true; global.prompt=()=>''; global.alert=()=>{};

const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'web-coach.html'), 'utf8');
const src = html.match(/<script>([\s\S]*)<\/script>/)[1];
const extra = "\n;toast = (m) => console.log('   AVISO:', m);"
  + "\n;return {MIOS, openAltaEjercicio, crearEjercicio, LINKS, camposDeEjercicio, elegidos, EJERCICIOS};";
const api = new Function(src + extra)();
console.log('métricas que lee el formulario:', api.elegidos('neMetricas'));
console.log('disciplinas:', api.elegidos('neDis'));
console.log('músculos:', api.elegidos('neMusculos'));

console.log('antes:', api.MIOS.length, 'ejercicios propios');
// El orden importa y me equivoqué la primera vez: abrir el formulario lo
// LIMPIA, que es lo correcto para un alta nueva. El coach escribe después.
api.openAltaEjercicio();
Object.entries(VALORES).forEach(([id, v]) => { nodo(id).value = v; });
api.crearEjercicio();
const nuevo = api.MIOS[api.MIOS.length-1];
console.log('después:', api.MIOS.length);
console.log('\nlo que quedó guardado:');
Object.entries(nuevo).forEach(([k,v]) =>
  console.log('   ' + k.padEnd(7) + ' = ' + JSON.stringify(v)));
console.log('\nenlace:', api.LINKS[nuevo.n] || '(ninguno)');
const campos = api.camposDeEjercicio(nuevo.n, {n:'Estaciones Hyrox'});
console.log('campos que pedirá en un bloque de Hyrox:', campos.map(([k])=>k).join(' · '));
const enFuerza = api.camposDeEjercicio(nuevo.n, {n:'Fuerza'});
console.log('… y en un bloque de fuerza:', enFuerza.map(([k])=>k).join(' · '));

// --- y ahora las aserciones, que es lo que hace de esto una prueba
const fallos = [];
const esperado = {
  n:'Sled push a 50%', p:'Monoestructural', nivel:'Intermedio',
  d:['hyrox'], q:['trineo'], m:['distance','time','load'],
  mus:['cuadriceps','gluteos','cuerpo_completo'],
};
for (const [k, v] of Object.entries(esperado)){
  const tengo = JSON.stringify(nuevo[k]), quiero = JSON.stringify(v);
  if (tengo !== quiero) fallos.push(`${k}: guardó ${tengo}, esperaba ${quiero}`);
}
if (!nuevo.cue) fallos.push('cue: no guardó las indicaciones');
if (api.LINKS[nuevo.n] !== VALORES.neVideo) fallos.push('el enlace no se guardó');

// Los campos tienen que salir de las métricas marcadas, no de series y carga.
const nombres = campos.map(([k]) => k).join('|');
if (/Series|RPE/.test(nombres)) fallos.push(`en Hyrox pidió ${nombres}`);
if (!/Distancia/.test(nombres)) fallos.push('no pidió distancia a un empuje de trineo');

console.log(fallos.length ? '\n✗ ' + fallos.length + ' fallo(s):\n   ' + fallos.join('\n   ')
                          : '\n✓ el alta guarda los diez campos y los usa para la sesión');
process.exit(fallos.length ? 1 : 0);
