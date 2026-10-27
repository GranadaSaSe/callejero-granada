// Pantalla de inicio: accesos a cada sección y estado de la app en este dispositivo.
import { diasDesdeLaUltimaCopia, guardarCopia, hayProgreso, leerCopia, recuperarCopia } from '../copia.js'
import { crear, rellenar } from '../crear.js'
import {
  alCambiarNotas,
  borrarNota,
  compartirNotas,
  describirFecha,
  guardarAutor,
  importarNotas,
  leerAutor,
  leerNotas,
} from '../notas.js'

const SECCIONES = [
  { titulo: 'Mapa de estudio', texto: 'Calles, sentidos, distritos, barrios y lugares de interés', enlace: '#/mapa' },
  { titulo: 'Ejes principales', texto: 'Las grandes vías y sus cruces, en orden', enlace: '#/ejes' },
  { titulo: 'Tarjetas de repaso', texto: 'Lo que fallas vuelve antes', enlace: '#/tarjetas' },
  { titulo: 'Test tipo examen', texto: 'Por temas, con penalización, nota y corrección', enlace: '#/test' },
]

function fila(texto) {
  const estado = crear('span', { class: 'estado' }, '…')
  const elemento = crear('li', { 'data-ok': 'no' }, crear('span', { class: 'marca', 'aria-hidden': 'true' }), crear('span', { class: 'texto' }, texto), estado)
  return {
    elemento,
    marcar(ok, valor) {
      elemento.dataset.ok = ok ? 'si' : 'no'
      estado.textContent = valor
    },
  }
}

// Notas dejadas en el mapa: las propias, las de compañeros, compartir por archivo y abrir archivos ajenos
let avisoNotas = ''

function filaNota(n) {
  // Las notas sobre preguntas no tienen punto en el mapa: se enlaza a su calle, lugar o eje si lo hay
  const enlace = n.punto ? `#/mapa?nota=${encodeURIComponent(n.id)}` : n.pregunta?.enlace
  return crear(
    'li',
    {},
    crear('strong', {}, n.tipo),
    n.pregunta && crear('p', { class: 'nota-pregunta' }, `${n.pregunta.modo}: «${n.pregunta.texto}»`),
    crear('p', {}, [n.calle?.nombre ?? n.lugar?.nombre, n.comentario?.trim()].filter(Boolean).join(' · ') || 'Sin comentario'),
    crear(
      'small',
      {},
      n.importada
        ? `De ${n.autor} · ${describirFecha(n.fecha)}`
        : n.compartida
          ? `Compartida el ${describirFecha(n.compartida)}`
          : `Sin compartir · ${describirFecha(n.fecha)}`,
    ),
    crear(
      'div',
      { class: 'chips' },
      enlace && crear('a', { class: 'chip', href: enlace }, enlace.startsWith('#/ejes') ? 'Ver el eje' : 'Ver en el mapa'),
      crear('button', { class: 'chip', onclick: () => confirm('¿Borrar esta nota?') && borrarNota(n.id) }, 'Borrar'),
    ),
  )
}

function pintarNotas(tarjeta) {
  const notas = leerNotas()
  const propias = notas.filter((n) => !n.importada)
  const ajenas = notas.filter((n) => n.importada)
  const sinCompartir = propias.filter((n) => !n.compartida).length

  const nombre = crear('input', { type: 'text', value: leerAutor(), placeholder: 'Por ejemplo: Miguel', maxlength: 40 })
  nombre.addEventListener('change', () => guardarAutor(nombre.value))
  const archivo = crear('input', { type: 'file', accept: '.txt,.json,text/plain,application/json', hidden: true })
  archivo.addEventListener('change', async () => {
    try {
      const { autor, nuevas, repetidas, estropeadas } = await importarNotas(archivo.files[0])
      const detalles = [repetidas && `${repetidas} ya las tenías`, estropeadas && `${estropeadas} no se han podido leer`]
      avisoNotas =
        `Abiertas ${nuevas} nota${nuevas === 1 ? '' : 's'} de ${autor}` +
        (detalles.some(Boolean) ? ` (${detalles.filter(Boolean).join(', ')}).` : '.')
    } catch {
      avisoNotas = 'Ese archivo no es un archivo de notas de la app.'
    }
    pintarNotas(tarjeta)
  })
  async function compartir(todas) {
    if (!leerAutor() && nombre.value.trim()) guardarAutor(nombre.value)
    const resultado = await compartirNotas({ todas })
    avisoNotas = {
      compartido: 'Notas compartidas.',
      descargado: 'Se ha descargado el archivo con tus notas: mándalo por WhatsApp o pásaselo a Claude.',
      cancelado: '',
      nada: 'No tienes notas que compartir.',
    }[resultado]
    pintarNotas(tarjeta)
  }

  rellenar(
    tarjeta,
    crear('h2', {}, 'Notas'),
    crear(
      'p',
      {},
      'Si ves algo mal en el mapa, mantén pulsado ese sitio (en el ordenador, clic derecho) y deja una nota. ' +
        'En las tarjetas y los tests, usa el botón «✎ Nota» de cada pregunta. ' +
        'Luego compártelas todas en un archivo, por WhatsApp por ejemplo.',
    ),
    crear('label', { class: 'campo' }, 'Tu nombre, para que se sepa de quién son tus notas', nombre),
    propias.length > 0 && [crear('h3', {}, `Mis notas (${propias.length})`), crear('ul', { class: 'lista-notas' }, [...propias].reverse().map(filaNota))],
    crear(
      'div',
      { class: 'acciones-eje' },
      sinCompartir > 0 && crear('button', { class: 'boton', onclick: () => compartir(false) }, `Compartir mis notas (${sinCompartir})`),
      sinCompartir === 0 &&
        propias.length > 0 &&
        crear('button', { class: 'boton secundario', onclick: () => compartir(true) }, 'Compartir todas otra vez'),
      crear('button', { class: 'boton secundario', onclick: () => archivo.click() }, 'Abrir notas de un compañero'),
    ),
    archivo,
    avisoNotas && crear('p', { class: 'aviso-notas', role: 'status' }, avisoNotas),
    ajenas.length > 0 && [
      crear('h3', {}, `Notas de compañeros (${ajenas.length})`),
      crear('ul', { class: 'lista-notas' }, [...ajenas].reverse().map(filaNota)),
    ],
  )
}

// Copia de seguridad del progreso (paso 1.8): guardarla en un archivo y recuperarla
let avisoCopia = ''

function pintarCopia(tarjeta, avisoArriba) {
  const dias = diasDesdeLaUltimaCopia()
  // Recordatorio semanal arriba del todo, si hay progreso que perder
  const tocaCopia = hayProgreso() && (dias === null || dias >= 7)
  avisoArriba.hidden = !tocaCopia
  avisoArriba.textContent =
    dias === null ? 'Aún no has guardado una copia de tu progreso. Toca aquí para hacerla.' : `Hace ${dias} días de tu última copia de seguridad. Toca aquí para hacer otra.`
  const archivo = crear('input', { type: 'file', accept: '.txt,.json,text/plain,application/json', hidden: true })
  archivo.addEventListener('change', async () => {
    try {
      const { fecha, datos } = await leerCopia(archivo.files[0])
      const cuando = fecha ? describirFecha(fecha) : 'fecha desconocida'
      if (confirm(`Copia del ${cuando}. Se sustituirá todo lo que la app tiene guardado en este dispositivo. ¿Seguir?`)) {
        recuperarCopia(datos)
        location.reload() // para que todas las pantallas lean lo recuperado
        return
      }
      avisoCopia = ''
    } catch {
      avisoCopia = 'Ese archivo no es una copia de la app.'
    }
    pintarCopia(tarjeta, avisoArriba)
  })
  rellenar(
    tarjeta,
    crear('h2', {}, 'Copia de seguridad'),
    crear(
      'p',
      {},
      'Tu progreso (tarjetas, tests, ejes, notas y ajustes) solo está guardado en este dispositivo. ' +
        'Guarda una copia de vez en cuando, por si cambias de móvil o se borran los datos.',
    ),
    crear(
      'p',
      { class: tocaCopia ? 'aviso-copia' : 'ficha-nota' },
      dias === null ? 'Todavía no has guardado ninguna copia.' : dias === 0 ? 'Última copia: hoy.' : `Última copia: hace ${dias} día${dias === 1 ? '' : 's'}.`,
    ),
    crear(
      'div',
      { class: 'acciones-eje' },
      crear(
        'button',
        {
          class: 'boton',
          onclick: async () => {
            const resultado = await guardarCopia()
            avisoCopia = {
              compartido: 'Copia guardada. Ponla en un sitio seguro (Drive, Archivos, tu WhatsApp…).',
              descargado: 'Se ha descargado el archivo de la copia. Guárdalo en un sitio seguro.',
              cancelado: '',
            }[resultado]
            pintarCopia(tarjeta, avisoArriba)
          },
        },
        'Guardar copia',
      ),
      crear('button', { class: 'boton secundario', onclick: () => archivo.click() }, 'Recuperar una copia'),
    ),
    archivo,
    avisoCopia && crear('p', { class: 'aviso-notas', role: 'status' }, avisoCopia),
  )
}

export function abrir(contenedor) {
  const instalada = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  const tarjetaNotas = crear('section', { class: 'tarjeta' })
  pintarNotas(tarjetaNotas)
  alCambiarNotas(() => pintarNotas(tarjetaNotas))
  const tarjetaCopia = crear('section', { class: 'tarjeta', id: 'copia' })
  const avisoCopiaArriba = crear('button', {
    class: 'aviso-copia-arriba',
    hidden: true,
    onclick: () => tarjetaCopia.scrollIntoView({ behavior: 'smooth' }),
  })
  pintarCopia(tarjetaCopia, avisoCopiaArriba)
  // Las notas también cuentan como progreso: al crear una, puede tocar avisar de la copia
  alCambiarNotas(() => pintarCopia(tarjetaCopia, avisoCopiaArriba))
  const filaInstalada = fila('Instalada en la pantalla de inicio')
  const filaSinInternet = fila('Lista para usarse sin internet')
  const conexion = crear('strong')

  contenedor.append(
    crear(
      'div',
      { class: 'pagina' },
      crear(
        'header',
        { class: 'cabecera' },
        crear('img', { class: 'logo', src: `${import.meta.env.BASE_URL}icon.svg`, alt: '', width: 56, height: 56 }),
        crear('div', {}, crear('p', { class: 'etiqueta' }, 'Bomberos de Granada'), crear('h1', {}, 'Callejero Granada')),
      ),
      avisoCopiaArriba,
      crear(
        'ul',
        { class: 'secciones' },
        SECCIONES.map((s) =>
          crear(
            'li',
            {},
            s.enlace
              ? crear('a', { class: 'seccion', href: s.enlace }, crear('strong', {}, s.titulo), crear('span', {}, s.texto))
              : crear(
                  'div',
                  { class: 'seccion proximamente' },
                  crear('strong', {}, s.titulo),
                  crear('span', {}, s.texto),
                  crear('em', {}, 'Próximamente'),
                ),
          ),
        ),
      ),
      tarjetaNotas,
      tarjetaCopia,
      crear(
        'section',
        { class: 'tarjeta' },
        crear('h2', {}, 'Esta app en tu dispositivo'),
        crear('ul', { class: 'comprobaciones' }, filaInstalada.elemento, filaSinInternet.elemento),
        crear('p', { class: 'conexion' }, 'Ahora mismo: ', conexion),
      ),
      !instalada &&
        crear(
          'section',
          { class: 'tarjeta' },
          crear('h2', {}, 'Cómo instalarla'),
          crear('h3', {}, 'Android (Chrome)'),
          crear('p', {}, 'Menú ⋮ → Instalar aplicación o Añadir a pantalla de inicio.'),
          crear('h3', {}, 'iPhone (Safari)'),
          crear('p', {}, 'Botón Compartir → Añadir a pantalla de inicio.'),
        ),
      crear(
        'footer',
        { class: 'pie' },
        `Versión ${__VERSION__} · Datos: © colaboradores de OpenStreetMap y Callejero Digital de Andalucía (Junta de Andalucía)`,
      ),
    ),
  )

  filaInstalada.marcar(instalada, instalada ? 'Sí' : 'Todavía no')
  if (!('serviceWorker' in navigator)) filaSinInternet.marcar(false, 'No disponible')
  else navigator.serviceWorker.ready.then(() => filaSinInternet.marcar(true, 'Lista'))

  const mostrarConexion = () => (conexion.textContent = navigator.onLine ? 'con internet' : 'sin internet')
  mostrarConexion()
  window.addEventListener('online', mostrarConexion)
  window.addEventListener('offline', mostrarConexion)
  return {}
}
