importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.0.0/workbox-sw.js');

if (workbox){
  workbox.routing.registerRoute(
    new RegExp('\\.(?:js|css)$'),
    new workbox.strategies.StaleWhileRevalidate()
  )
  workbox.precaching.precacheAndRoute([
    '/index.html',
  ])
}