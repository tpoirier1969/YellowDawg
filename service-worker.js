
const cacheName = "yellowdog-v1";

self.addEventListener("install", e=>{
 e.waitUntil(
   caches.open(cacheName).then(cache=>{
     return cache.addAll([
       "./",
       "./index.html",
       "./app.js",
       "./manifest.json"
     ]);
   })
 );
});

self.addEventListener("fetch", e=>{
 e.respondWith(
   caches.match(e.request).then(res=> res || fetch(e.request))
 );
});
