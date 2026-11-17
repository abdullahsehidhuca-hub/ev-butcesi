// Android geri tuşu: en son açılan çekmeceyi kapatır; çekmece yoksa sayfa geçmişinde geri gider, o da yoksa
// uygulamayı arka plana alır (kapatmaz; dönüldüğünde kaldığı yerden açılır). iOS ve web'de bu modül hiçbir şey
// dinlemez; çekmeceler orada Esc ve arka plana dokunmayla kapanır.
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

const stack = [];

if (Capacitor.getPlatform() === "android") {
  App.addListener("backButton", ({ canGoBack }) => {
    if (stack.length) stack[stack.length - 1]();
    else if (canGoBack) window.history.back();
    else App.minimizeApp();
  });
}

// Açık çekmecenin kapatma işlevini yığına ekler; dönen işlev çekmece kapanınca onu yığından çıkarır.
export function pushBack(fn) {
  stack.push(fn);
  return () => {
    const i = stack.lastIndexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}
