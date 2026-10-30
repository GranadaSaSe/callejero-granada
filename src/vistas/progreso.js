// Tu progreso (paso 1.10): cuenta atrás hasta el examen, racha de días seguidos estudiando y aciertos
// por tema; y, por zonas (paso 2.6), cuántas calles de cada distrito dominas y el enlace al mapa de tus
// fallos. Todo sale de lo guardado en este dispositivo (ver src/actividad.js y src/progreso-zonas.js).
import {
  aciertosPorTema,
  diasHasta,
  fechaDeDia,
  guardarFechaExamen,
  leerActividad,
  leerFechaExamen,
  preguntasDelDia,
  racha,
  sumarDias,
  temaDeMazo,
  textoDia,
} from '../actividad.js'
import { crear, miles, rellenar } from '../crear.js'
import { cargar } from '../datos.js'
import { CLAVES_EJES, ejesActuales, leerConjunto } from '../ejes-lista.js'
import { NIVELES, TEMAS } from '../examen-datos.js'
import { leerGuardado, progresoPorZonas } from '../progreso-zonas.js'
import { aprendida } from '../repaso.js'
import { crearTarjetas } from '../tarjetas-datos.js'

const PERIODOS = [
  { id: 7, nombre: '7 días' },
  { id: 30, nombre: '30 días' },
  { id: 0, nombre: 'Siempre' },
]
const SEMANAS = 5 // semanas que se ven en el calendario
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MINIMO_PARA_FLOJO = 10 // preguntas de un tema antes de decir que es el más flojo

function leer(clave, porDefecto) {
  try {
    return JSON.parse(localStorage.getItem(clave)) ?? porDefecto
  } catch {
    return porDefecto
  }
}

const porcentaje = (bien, total) => Math.round((100 * bien) / total)
const fechaLarga = (dia, conAno = false) =>
  fechaDeDia(dia).toLocaleDateString('es-ES', { weekday: conAno ? undefined : 'long', day: 'numeric', month: 'long', year: conAno ? 'numeric' : undefined })
const nota = (n) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const plural = (n, uno, varios) => `${miles(n)} ${n === 1 ? uno : varios}`

// Intensidad de cada día del calendario según las preguntas contestadas (0 = no estudió)
function nivelDelDia(dia) {
  if (!dia) return 0
  const n = preguntasDelDia(dia)
  return n >= 100 ? 4 : n >= 50 ? 3 : n >= 20 ? 2 : 1
}

const cifra = (numero, texto) => crear('div', { class: 'cifra' }, crear('strong', {}, numero), crear('span', {}, texto))

export async function abrir(contenedor) {
  const pagina = crear('div', { class: 'pagina' }, crear('p', { class: 'cargando-texto' }, 'Calculando tu progreso…'))
  contenedor.append(pagina)
  const [calles, lugares, municipios, salidas, tramos] = await Promise.all(['calles', 'lugares', 'municipios', 'salidas', 'tramos'].map(cargar))
  const zona = { municipios, salidas } // zona de los parques de Granada (paso 2.5)
  let periodo = 30
  let nivelZonas = 'medio' // qué calles cuentan en «Por zonas»
  let editandoFecha = false
  let diaElegido = null
  let mazos = {} // todas las tarjetas, por mazo (se rehacen al abrir: los ejes pueden haber cambiado)

  function cuentaAtras() {
    const { fecha, elegida } = leerFechaExamen()
    const quedan = diasHasta(fecha)
    const entrada = crear('input', { type: 'date', value: fecha, min: textoDia(new Date()) })
    return crear(
      'section',
      { class: 'tarjeta' },
      crear('h2', {}, 'Cuenta atrás'),
      crear(
        'p',
        { class: 'numero-grande' },
        crear('strong', {}, quedan > 0 ? miles(quedan) : quedan === 0 ? '¡Hoy!' : '—'),
        quedan > 0 && crear('span', {}, quedan === 1 ? ' día para el examen' : ' días para el examen'),
      ),
      crear(
        'p',
        { class: 'ficha-nota' },
        quedan < 0 ? 'La fecha del examen ya ha pasado. ' : quedan >= 14 ? `Unas ${miles(Math.round(quedan / 7))} semanas. ` : '',
        `Fecha: ${fechaLarga(fecha, true)}`,
        elegida ? '.' : ' (aproximada: cámbiala cuando se sepa la fecha).',
      ),
      editandoFecha
        ? crear(
            'div',
            { class: 'editar-fecha' },
            crear('label', { class: 'campo' }, 'Fecha del examen', entrada),
            crear(
              'div',
              { class: 'acciones-eje' },
              crear(
                'button',
                {
                  class: 'boton',
                  onclick: () => {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.value)) return
                    guardarFechaExamen(entrada.value)
                    editandoFecha = false
                    pintar()
                  },
                },
                'Guardar',
              ),
              elegida &&
                crear(
                  'button',
                  {
                    class: 'boton secundario',
                    onclick: () => {
                      guardarFechaExamen(null)
                      editandoFecha = false
                      pintar()
                    },
                  },
                  'Usar la prevista',
                ),
              crear('button', { class: 'enlace-discreto', onclick: () => ((editandoFecha = false), pintar()) }, 'Cancelar'),
            ),
          )
        : crear('button', { class: 'enlace-discreto', onclick: () => ((editandoFecha = true), pintar()) }, 'Cambiar la fecha'),
    )
  }

  function tarjetaRacha(dias) {
    const hoy = textoDia(new Date())
    const { actual, mejor, hoy: hoyHecho } = racha(dias, hoy)
    const mensaje = hoyHecho
      ? 'Hoy ya has estudiado. ¡Sigue así!'
      : actual
        ? 'Hoy aún no has estudiado: contesta alguna pregunta para no perder la racha.'
        : 'Contesta alguna pregunta hoy para empezar una racha.'

    // Calendario de las últimas semanas, de lunes a domingo
    const lunes = sumarDias(hoy, -((fechaDeDia(hoy).getDay() + 6) % 7))
    const primero = sumarDias(lunes, -7 * (SEMANAS - 1))
    const detalle = crear('p', { class: 'detalle-dia', 'aria-live': 'polite' })
    const textoDelDia = (dia) => {
      const datos = dias[dia]
      if (!datos) return `${fechaLarga(dia)}: sin estudiar`
      const temas = Object.values(datos)
      const total = preguntasDelDia(datos)
      const bien = temas.reduce((s, [b]) => s + b, 0)
      return total
        ? `${fechaLarga(dia)}: ${plural(total, 'pregunta', 'preguntas')}, ${miles(bien)} bien`
        : `${fechaLarga(dia)}: estudiaste (de antes de la versión 0.9, sin cifras)`
    }
    const celdas = []
    for (let i = 0; i < SEMANAS * 7; i++) {
      const dia = sumarDias(primero, i)
      if (dia > hoy) {
        celdas.push(crear('span', { class: 'dia-calendario futuro', 'aria-hidden': 'true' }))
        continue
      }
      celdas.push(
        crear('button', {
          class: `dia-calendario nivel-${nivelDelDia(dias[dia])}${dia === hoy ? ' es-hoy' : ''}${dia === diaElegido ? ' elegido' : ''}`,
          title: textoDelDia(dia),
          'aria-label': textoDelDia(dia),
          onclick: () => {
            diaElegido = dia
            pintar()
          },
        }),
      )
    }
    detalle.textContent = textoDelDia(diaElegido ?? hoy)

    return crear(
      'section',
      { class: 'tarjeta' },
      crear('h2', {}, 'Racha de estudio'),
      crear(
        'div',
        { class: 'cifras' },
        cifra(miles(actual), actual === 1 ? 'día seguido' : 'días seguidos'),
        cifra(miles(mejor), 'mejor racha'),
        cifra(miles(preguntasDelDia(dias[hoy])), 'preguntas hoy'),
      ),
      crear('p', { class: hoyHecho ? 'hecho' : 'ficha-nota' }, mensaje),
      crear(
        'div',
        { class: 'calendario', role: 'group', 'aria-label': `Días estudiados en las últimas ${SEMANAS} semanas` },
        DIAS_SEMANA.map((d) => crear('span', { class: 'dia-semana', 'aria-hidden': 'true' }, d)),
        celdas,
      ),
      crear(
        'div',
        { class: 'leyenda-calendario', 'aria-hidden': 'true' },
        'Menos',
        [0, 1, 2, 3, 4].map((n) => crear('span', { class: `dia-calendario nivel-${n}` })),
        'Más',
      ),
      detalle,
    )
  }

  function tarjetaTemas(dias, estados) {
    const desde = periodo ? sumarDias(textoDia(new Date()), -(periodo - 1)) : ''
    const cuentas = aciertosPorTema(dias, desde)
    const tarjetasDe = (tema) => Object.entries(mazos).filter(([mazo]) => temaDeMazo(mazo) === tema).flatMap(([, lista]) => lista)
    const flojo = TEMAS.map((t) => ({ ...t, ...cuentas[t.id] }))
      .filter((t) => t.total >= MINIMO_PARA_FLOJO)
      .sort((a, b) => a.bien / a.total - b.bien / b.total)[0]

    return crear(
      'section',
      { class: 'tarjeta' },
      crear('h2', {}, 'Aciertos por tema'),
      crear(
        'div',
        { class: 'chips filtro-periodo' },
        PERIODOS.map((p) =>
          crear(
            'button',
            {
              class: 'chip',
              'aria-pressed': String(p.id === periodo),
              onclick: () => {
                periodo = p.id
                pintar()
              },
            },
            p.nombre,
          ),
        ),
      ),
      crear(
        'ul',
        { class: 'lista-temas' },
        TEMAS.map((t) => {
          const { bien = 0, total = 0 } = cuentas[t.id] ?? {}
          const tarjetas = tarjetasDe(t.id)
          const sabidas = tarjetas.filter((x) => aprendida(estados[x.id])).length
          return crear(
            'li',
            { class: 'fila-tema' },
            crear(
              'div',
              { class: 'fila-tema-cabecera' },
              crear('strong', {}, t.nombre),
              crear('span', {}, total ? `${porcentaje(bien, total)} % · ${plural(total, 'pregunta', 'preguntas')}` : 'Sin preguntas'),
            ),
            crear(
              'div',
              { class: 'barra-tema', role: 'img', 'aria-label': total ? `${porcentaje(bien, total)} % de aciertos` : 'Sin datos' },
              bien > 0 && crear('div', { style: `width: ${porcentaje(bien, total)}%` }),
            ),
            tarjetas.length > 0 && crear('small', {}, `Tarjetas aprendidas: ${miles(sabidas)} de ${miles(tarjetas.length)}`),
          )
        }),
      ),
      crear(
        'p',
        { class: 'ficha-nota' },
        flojo
          ? `Tu tema más flojo ahora: ${flojo.nombre} (${porcentaje(flojo.bien, flojo.total)} %). Dale un repaso en Tarjetas o en el Test.`
          : `Cuenta lo que contestas en las tarjetas, el Kahoot y el test tipo examen (las de en blanco cuentan como no acertadas). Una tarjeta está aprendida cuando no vuelve a salir hasta dentro de 3 semanas o más.`,
      ),
    )
  }

  // Por zonas (paso 2.6): calles dominadas de cada distrito y pueblos dominados de cada parte de la zona
  function tarjetaZonas() {
    const { distritos, partes } = progresoPorZonas({ calles, lugares, tramos, municipios, salidas }, leerGuardado(), { nivel: nivelZonas })
    const fila = (z, cosas) => {
      const pct = z.total ? porcentaje(z.dominadas, z.total) : 0
      const empezadas = z.vistas - z.dominadas
      return crear(
        'li',
        { class: 'fila-tema' },
        crear(
          'div',
          { class: 'fila-tema-cabecera' },
          crear('strong', {}, z.nombre),
          crear('span', {}, `${pct} % dominado · ${miles(z.dominadas)} de ${plural(z.total, cosas[0], cosas[1])}`),
        ),
        crear(
          'div',
          { class: 'barra-zona', role: 'img', 'aria-label': `${pct} % dominado, ${empezadas} empezadas` },
          z.dominadas > 0 && crear('div', { class: 'dominadas', style: `width: ${(100 * z.dominadas) / z.total}%` }),
          empezadas > 0 && crear('div', { class: 'empezadas', style: `width: ${(100 * empezadas) / z.total}%` }),
        ),
        z.vistas > 0 && crear('small', {}, `Vistas: ${miles(z.vistas)} · sin dominar todavía: ${miles(empezadas)}`),
      )
    }
    return crear(
      'section',
      { class: 'tarjeta' },
      crear('h2', {}, 'Por zonas'),
      crear(
        'div',
        { class: 'chips filtro-periodo' },
        NIVELES.map((n) =>
          crear(
            'button',
            {
              class: 'chip',
              'aria-pressed': String(n.id === nivelZonas),
              onclick: () => {
                nivelZonas = n.id
                pintar()
              },
            },
            n.nombre,
          ),
        ),
      ),
      crear('ul', { class: 'lista-temas' }, distritos.map((d) => fila(d, ['calle', 'calles']))),
      crear('h3', {}, 'Zona de los parques'),
      crear('ul', { class: 'lista-temas' }, partes.map((p) => fila(p, ['pueblo', 'pueblos']))),
      crear(
        'p',
        { class: 'ficha-nota' },
        crear('span', { class: 'punto-leyenda dominadas' }),
        ' dominadas ',
        crear('span', { class: 'punto-leyenda empezadas' }),
        ' empezadas. Dominas una calle (o un pueblo) cuando la tienes aprendida en tarjetas o la has acertado al menos dos veces en los juegos, y la última vez que salió no la fallaste.',
      ),
      crear('a', { class: 'boton secundario', href: '#/mapa?fallos=1' }, 'Ver mis fallos en el mapa'),
    )
  }

  function tarjetaResumen(estados) {
    const historial = leer('callejero-examen-historial', [])
    const mejorNota = historial.length ? Math.max(...historial.map((t) => t.nota)) : null
    const ejes = ejesActuales(calles)
    const sabidos = leerConjunto(CLAVES_EJES.sabidos)
    const todas = Object.values(mazos).flat()
    const vistas = todas.filter((t) => estados[t.id]).length
    const ultimo = historial[0]
    return crear(
      'section',
      { class: 'tarjeta' },
      crear('h2', {}, 'En resumen'),
      crear(
        'div',
        { class: 'cifras' },
        cifra(miles(historial.length), historial.length === 1 ? 'test hecho' : 'tests hechos'),
        cifra(mejorNota === null ? '—' : nota(mejorNota), 'mejor nota'),
        cifra(`${miles(ejes.filter((c) => sabidos.has(c.id)).length)}/${miles(ejes.length)}`, 'ejes sabidos'),
      ),
      crear(
        'p',
        { class: 'ficha-nota' },
        ultimo ? `Último test: ${nota(ultimo.nota)} sobre 10, el ${fechaLarga(textoDia(new Date(ultimo.fecha)))}. ` : 'Aún no has hecho ningún test tipo examen. ',
        `Tarjetas vistas: ${miles(vistas)} de ${miles(todas.length)}.`,
      ),
    )
  }

  function pintar() {
    const { dias } = leerActividad()
    const estados = leer('callejero-tarjetas', {})
    rellenar(
      pagina,
      crear('a', { class: 'enlace-discreto volver', href: '#/inicio' }, '← Inicio'),
      crear('h1', {}, 'Tu progreso'),
      crear('p', { class: 'intro' }, 'Con lo que has estudiado en este dispositivo.'),
      cuentaAtras(),
      tarjetaRacha(dias),
      tarjetaTemas(dias, estados),
      tarjetaZonas(),
      tarjetaResumen(estados),
    )
  }

  return {
    // Se recalcula cada vez que se abre, por si se ha estudiado en otra pantalla
    mostrar() {
      diaElegido = null
      mazos = crearTarjetas({ calles, lugares, ejes: ejesActuales(calles), zona })
      pintar()
    },
  }
}
