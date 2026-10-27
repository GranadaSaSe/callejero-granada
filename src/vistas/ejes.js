// Ejes principales (paso 1.5): las grandes vías de Granada y las calles que se encuentran en cada una,
// en orden, como las paradas de una línea de metro. Cada calle que cruza aparece a la izquierda o a la
// derecha según el lado por el que sale, yendo del inicio al final del eje.
import { crear, miles, normalizar, rellenar } from '../crear.js'
import { cargar } from '../datos.js'

const CLAVES = { propios: 'callejero-ejes-propios', ocultos: 'callejero-ejes-ocultos', sabidos: 'callejero-ejes-sabidos' }
const DISTRITOS = ['Centro', 'Albaicín', 'Beiro', 'Chana', 'Genil', 'Norte', 'Ronda', 'Zaidín']

// Un eje es una calle larga e importante con bastantes cruces. Las carreteras con código, los accesos y
// las plazas o glorietas no cuentan. Cada persona puede añadir o quitar ejes a su gusto.
const esEjePorDefecto = (c) =>
  !/^(Carretera [A-Z]{1,2}-|Acceso|Autov)/.test(c.nombre) &&
  !['Plaza', 'Placeta', 'Glorieta'].includes(c.tipo) &&
  ((c.importancia === 1 && c.cruces.length >= 5) ||
    (c.importancia <= 2 && c.cruces.length >= 8 && c.longitud >= 400) ||
    (c.importancia === 3 && c.cruces.length >= 15 && c.longitud >= 600))

function leer(clave) {
  try {
    return new Set(JSON.parse(localStorage.getItem(clave)) ?? [])
  } catch {
    return new Set()
  }
}

function guardar(clave, conjunto) {
  try {
    localStorage.setItem(clave, JSON.stringify([...conjunto]))
  } catch {
    // Sin almacenamiento (modo privado): los cambios duran solo mientras la app esté abierta
  }
}

function textoSentido(c) {
  const desde = c.inicio[0] ?? 'el principio'
  const hasta = c.fin[0] ?? 'el final'
  return {
    doble: 'Doble sentido',
    peatonal: 'Peatonal',
    'hacia el final': `Sentido único hacia ${hasta}`,
    'hacia el inicio': `Sentido único hacia ${desde}`,
    mixto: 'Sentido distinto según el tramo',
  }[c.sentido] ?? 'Sentido sin datos'
}

export async function abrir(contenedor) {
  const pagina = crear('div', { class: 'pagina' }, crear('p', { class: 'cargando-texto' }, 'Cargando los ejes…'))
  contenedor.append(pagina)

  const calles = await cargar('calles')
  const callePorId = new Map(calles.map((c) => [c.id, c]))
  const propios = leer(CLAVES.propios)
  const ocultos = leer(CLAVES.ocultos)
  const sabidos = leer(CLAVES.sabidos)
  let filtroDistrito = 'Todos'

  const esEje = (c) => (esEjePorDefecto(c) && !ocultos.has(c.id)) || propios.has(c.id)
  const ejes = () => calles.filter(esEje)

  // Lista de ejes por distrito
  function lista() {
    const todos = ejes()
    const visibles = todos.filter((c) => filtroDistrito === 'Todos' || c.distritos[0] === filtroDistrito)
    const buscador = crear('input', { type: 'search', placeholder: 'Buscar una calle para añadirla', autocomplete: 'off' })
    const sugerencias = crear('ul', { class: 'sugerencias' })
    buscador.addEventListener('input', () => {
      const q = normalizar(buscador.value)
      const encontradas =
        q.length < 2 ? [] : calles.filter((c) => !esEje(c) && normalizar(c.nombre).includes(q)).slice(0, 6)
      rellenar(sugerencias, 
        ...encontradas.map((c) =>
          crear(
            'li',
            {},
            crear(
              'button',
              {
                class: 'chip',
                onclick: () => {
                  propios.add(c.id)
                  ocultos.delete(c.id)
                  guardar(CLAVES.propios, propios)
                  guardar(CLAVES.ocultos, ocultos)
                  location.hash = `#/ejes?id=${c.id}`
                },
              },
              `+ ${c.nombre}`,
            ),
          ),
        ),
      )
    })

    const grupos = DISTRITOS.map((d) => [d, visibles.filter((c) => c.distritos[0] === d)]).filter(([, cs]) => cs.length)
    rellenar(pagina, 
      crear('h1', {}, 'Ejes principales'),
      crear(
        'p',
        { class: 'intro' },
        'Las grandes vías de Granada y las calles que se encuentran en cada una, en orden. ',
        `Llevas ${todos.filter((c) => sabidos.has(c.id)).length} de ${todos.length} marcados como sabidos.`,
      ),
      crear(
        'div',
        { class: 'chips filtro-distritos' },
        ['Todos', ...DISTRITOS].map((d) =>
          crear(
            'button',
            {
              class: 'chip',
              'aria-pressed': String(d === filtroDistrito),
              onclick: () => {
                filtroDistrito = d
                lista()
              },
            },
            d,
          ),
        ),
      ),
      grupos.map(([distrito, cs]) => [
        crear('h2', { class: 'grupo' }, distrito),
        crear(
          'ul',
          { class: 'lista-ejes' },
          cs
            .sort((a, b) => b.cruces.length - a.cruces.length)
            .map((c) =>
              crear(
                'li',
                {},
                crear(
                  'a',
                  { class: 'eje', href: `#/ejes?id=${c.id}` },
                  crear('strong', {}, c.nombre),
                  crear('span', {}, `${c.cruces.length} cruces · ${miles(c.longitud)} m`),
                  sabidos.has(c.id) && crear('em', {}, 'Sabido'),
                ),
              ),
            ),
        ),
      ]),
      crear('section', { class: 'tarjeta' }, crear('h2', {}, '¿Falta alguna calle?'), buscador, sugerencias),
    )
  }

  // Un eje dibujado como una línea de metro
  function detalle(c) {
    let tapar = false
    const linea = crear('ol', { class: 'linea-eje' })

    function parada(texto, lado, numero) {
      const nombre = crear('span', { class: 'nombre-parada' }, texto)
      if (tapar) {
        nombre.classList.add('tapado')
        nombre.textContent = '?'
        nombre.setAttribute('role', 'button')
        nombre.setAttribute('tabindex', '0')
        const destapar = () => {
          nombre.classList.remove('tapado')
          nombre.textContent = texto
        }
        nombre.addEventListener('click', destapar, { once: true })
        nombre.addEventListener('keydown', (e) => e.key === 'Enter' && destapar(), { once: true })
      }
      const izquierda = lado === 'i'
      return crear(
        'li',
        { class: `parada lado-${lado || 'd'}` },
        crear('span', { class: 'izquierda' }, izquierda && nombre),
        crear('span', { class: 'punto-linea' }, numero),
        crear('span', { class: 'derecha' }, !izquierda && nombre, lado === 'a' && crear('small', {}, ' (cruza)')),
      )
    }

    function dibujarLinea() {
      rellenar(linea, 
        crear('li', { class: 'extremo' }, crear('span', {}, 'Empieza en'), crear('strong', {}, c.inicio.join(' / ') || 'No sale a otra calle')),
        c.cruces.map((nombre, i) => parada(nombre, c.lados?.[i] ?? '', i + 1)),
        crear('li', { class: 'extremo' }, crear('span', {}, 'Termina en'), crear('strong', {}, c.fin.join(' / ') || 'No sale a otra calle')),
      )
    }

    const botonTapar = crear('button', { class: 'boton', 'aria-pressed': 'false' }, 'Repasar tapando nombres')
    botonTapar.addEventListener('click', () => {
      tapar = !tapar
      botonTapar.setAttribute('aria-pressed', String(tapar))
      botonTapar.textContent = tapar ? 'Mostrar todos los nombres' : 'Repasar tapando nombres'
      dibujarLinea()
    })
    const sabido = crear('input', { type: 'checkbox', checked: sabidos.has(c.id) })
    sabido.addEventListener('change', () => {
      if (sabido.checked) sabidos.add(c.id)
      else sabidos.delete(c.id)
      guardar(CLAVES.sabidos, sabidos)
    })
    const quitar = crear('button', { class: 'enlace-discreto' }, 'Quitar de mis ejes')
    quitar.addEventListener('click', () => {
      propios.delete(c.id)
      if (esEjePorDefecto(c)) ocultos.add(c.id)
      guardar(CLAVES.propios, propios)
      guardar(CLAVES.ocultos, ocultos)
      location.hash = '#/ejes'
    })

    dibujarLinea()
    rellenar(pagina, 
      crear('a', { class: 'volver', href: '#/ejes' }, '← Todos los ejes'),
      crear('p', { class: 'etiqueta' }, c.distritos.join(' · ')),
      crear('h1', {}, c.nombre),
      crear('p', { class: 'intro' }, `${miles(c.longitud)} m · ${c.cruces.length} calles que cruza · ${textoSentido(c)}`),
      crear(
        'div',
        { class: 'acciones-eje' },
        botonTapar,
        crear('a', { class: 'boton secundario', href: `#/mapa?calle=${c.id}` }, 'Ver en el mapa'),
      ),
      crear('p', { class: 'nota-eje' }, 'Izquierda y derecha, yendo desde donde empieza hasta donde termina.'),
      linea,
      crear('label', { class: 'casilla sabido' }, sabido, 'Ya me lo sé'),
      quitar,
    )
    contenedor.closest('.vistas')?.scrollTo(0, 0)
  }

  return {
    mostrar(parametros) {
      const calle = callePorId.get(Number(parametros?.get('id')))
      if (calle) detalle(calle)
      else lista()
    },
  }
}
