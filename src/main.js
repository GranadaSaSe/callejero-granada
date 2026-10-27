import './style.css'
import { registerSW } from 'virtual:pwa-register'

function marcar(id, ok, texto) {
  const fila = document.getElementById(id)
  fila.dataset.ok = ok ? 'si' : 'no'
  fila.querySelector('.estado').textContent = texto
}

// ¿Se ha abierto desde el icono de la pantalla de inicio?
const instalada =
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
marcar('check-instalada', instalada, instalada ? 'Sí' : 'Todavía no')
document.getElementById('como-instalar').hidden = instalada

function mostrarConexion() {
  document.getElementById('conexion').textContent = navigator.onLine ? 'con internet' : 'sin internet'
}
mostrarConexion()
window.addEventListener('online', mostrarConexion)
window.addEventListener('offline', mostrarConexion)

// El "service worker" guarda la app en el dispositivo para que funcione sin conexión
function marcarSinInternetLista() {
  marcar('check-offline', true, 'Lista')
}

if (!('serviceWorker' in navigator)) {
  marcar('check-offline', false, 'No disponible')
} else {
  if (navigator.serviceWorker.controller) marcarSinInternetLista()
  registerSW({
    immediate: true,
    onOfflineReady: marcarSinInternetLista,
    onRegisteredSW(_url, registro) {
      if (registro?.active) marcarSinInternetLista()
    },
  })
}
