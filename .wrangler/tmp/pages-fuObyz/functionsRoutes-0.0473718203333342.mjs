import { onRequestGet as __api_bank_sms_js_onRequestGet } from "C:\\Users\\User\\Downloads\\khiye-app\\drama-web\\functions\\api\\bank-sms.js"
import { onRequestPost as __api_bank_sms_js_onRequestPost } from "C:\\Users\\User\\Downloads\\khiye-app\\drama-web\\functions\\api\\bank-sms.js"
import { onRequestGet as __api_play_js_onRequestGet } from "C:\\Users\\User\\Downloads\\khiye-app\\drama-web\\functions\\api\\play.js"
import { onRequestPost as __api_poster_js_onRequestPost } from "C:\\Users\\User\\Downloads\\khiye-app\\drama-web\\functions\\api\\poster.js"
import { onRequestGet as __hls___path___js_onRequestGet } from "C:\\Users\\User\\Downloads\\khiye-app\\drama-web\\functions\\hls\\[[path]].js"
import { onRequestGet as __p___path___js_onRequestGet } from "C:\\Users\\User\\Downloads\\khiye-app\\drama-web\\functions\\p\\[[path]].js"
import { onRequestGet as __v___path___js_onRequestGet } from "C:\\Users\\User\\Downloads\\khiye-app\\drama-web\\functions\\v\\[[path]].js"

export const routes = [
    {
      routePath: "/api/bank-sms",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_bank_sms_js_onRequestGet],
    },
  {
      routePath: "/api/bank-sms",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_bank_sms_js_onRequestPost],
    },
  {
      routePath: "/api/play",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_play_js_onRequestGet],
    },
  {
      routePath: "/api/poster",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_poster_js_onRequestPost],
    },
  {
      routePath: "/hls/:path*",
      mountPath: "/hls",
      method: "GET",
      middlewares: [],
      modules: [__hls___path___js_onRequestGet],
    },
  {
      routePath: "/p/:path*",
      mountPath: "/p",
      method: "GET",
      middlewares: [],
      modules: [__p___path___js_onRequestGet],
    },
  {
      routePath: "/v/:path*",
      mountPath: "/v",
      method: "GET",
      middlewares: [],
      modules: [__v___path___js_onRequestGet],
    },
  ]