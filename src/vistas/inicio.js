// Pantalla de inicio: accesos a cada sección y estado de la app en este dispositivo.
import { crear, rellenar } from '../crear.js'
import { alCambiarNotas, borrarNota, describirFecha, enviarNotas, leerNotas, volverAEnviar } from '../notas.js'

const SECCIONES = [
  { titulo: 'Mapa de estudio', texto: 'Calles, sentidos, distritos, barrios y lugares de interés', enlace: '#/mapa' },
  { titulo: 'Ejes principales', texto: 'Las grandes vías y sus cruces, en orden', enlace: '#/ejes' },
  { titulo: 'Tarjetas de repaso', texto: 'Lo que fallas vuelve antes' },
  { titulo: 'Test por temas', texto: 'Preguntas tipo examen con explicación' },
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

// Notas dejadas en el mapa y botón para enviárselas a Claude
function pintarNotas(tarjeta) {
  const notas = leerNotas()
  const pendientes = notas.filter((n) => !n.enviada).length
  rellenar(
    tarjeta,
    crear('h2', {}, 'Mis notas'),
    notas.length === 0
      ? crear(
          'p',
          {},
          'Si ves algo mal en el mapa, mantén pulsado ese sitio (en el ordenador, clic derecho) y deja una nota. ' +
            'Aquí podrás enviárselas a Claude para arreglarlo.',
        )
      : [
          crear(
            'ul',
            { class: 'lista-notas' },
            [...notas].reverse().map((n) =>
              crear(
                'li',
                {},
                crear('strong', {}, n.tipo),
                crear('p', {}, [n.calle?.nombre ?? n.lugar?.nombre, n.comentario?.trim()].filter(Boolean).join(' · ') || 'Sin comentario'),
                crear('small', {}, n.enviada ? `Enviada el ${describirFecha(n.enviada)}` : `Sin enviar · ${describirFecha(n.fecha)}`),
                crear(
                  'div',
                  { class: 'chips' },
                  crear('a', { class: 'chip', href: `#/mapa?nota=${n.id}` }, 'Ver en el mapa'),
                  n.enviada && crear('button', { class: 'chip', onclick: () => volverAEnviar(n.id) }, 'Volver a enviar'),
                  crear('button', { class: 'chip', onclick: () => confirm('¿Borrar esta nota?') && borrarNota(n.id) }, 'Borrar'),
                ),
              ),
            ),
          ),
          pendientes > 0 && crear('button', { class: 'boton', onclick: enviarNotas }, `Enviar a Claude (${pendientes})`),
          crear(
            'p',
            { class: 'ficha-nota' },
            'Al enviar se abre GitHub con tus notas ya escritas: pulsa «Create» para mandarlas. ' +
              'Hace falta haber iniciado sesión en GitHub en el navegador del móvil.',
          ),
        ],
  )
}

export function abrir(contenedor) {
  const instalada = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  const tarjetaNotas = crear('section', { class: 'tarjeta' })
  pintarNotas(tarjetaNotas)
  alCambiarNotas(() => pintarNotas(tarjetaNotas))
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
