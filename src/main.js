import './style.css'
import { registerSW } from 'virtual:pwa-register'

// El "service worker" guarda la app y los datos en el dispositivo para que funcione sin internet
if ('serviceWorker' in navigator) registerSW({ immediate: true })

// Cada sección se carga la primera vez que se abre; después solo se muestra u oculta.
// La dirección puede llevar datos para la sección: #/mapa?calle=123 abre el mapa en esa calle.
const VISTAS = {
  inicio: { elemento: 'vista-inicio', cargar: () => import('./vistas/inicio.js') },
  mapa: { elemento: 'vista-mapa', cargar: () => import('./vistas/mapa.js') },
  ejes: { elemento: 'vista-ejes', cargar: () => import('./vistas/ejes.js') },
  tarjetas: { elemento: 'vista-tarjetas', cargar: () => import('./vistas/tarjetas.js') },
  test: { elemento: 'vista-test', cargar: () => import('./vistas/test.js') },
  progreso: { elemento: 'vista-progreso', cargar: () => import('./vistas/progreso.js') },
}
const abiertas = new Map()

async function navegar() {
  const [pedida, consulta = ''] = location.hash.replace(/^#\/?/, '').split('?')
  const ruta = VISTAS[pedida] ? pedida : 'inicio'
  for (const [nombre, vista] of Object.entries(VISTAS)) {
    document.getElementById(vista.elemento).hidden = nombre !== ruta
  }
  for (const enlace of document.querySelectorAll('.pestanas a')) {
    enlace.toggleAttribute('aria-current', enlace.dataset.ruta === ruta)
  }
  if (!abiertas.has(ruta)) {
    const modulo = await VISTAS[ruta].cargar()
    abiertas.set(ruta, await modulo.abrir(document.getElementById(VISTAS[ruta].elemento)))
  }
  abiertas.get(ruta)?.mostrar?.(new URLSearchParams(consulta))
}

window.addEventListener('hashchange', navegar)
navegar()
