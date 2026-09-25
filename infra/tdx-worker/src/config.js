export const TDX_TOKEN_URL = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token";
export const TDX_API_BASE = "https://tdx.transportdata.tw/api/basic";

export const ALL_CITIES = [
  "Taipei","NewTaipei","Taoyuan","Taichung","Tainan","Kaohsiung","Keelung","Hsinchu",
  "HsinchuCounty","MiaoliCounty","ChanghuaCounty","NantouCounty","YunlinCounty","Chiayi",
  "ChiayiCounty","PingtungCounty","YilanCounty","HualienCounty","TaitungCounty",
  "PenghuCounty","KinmenCounty","LienchiangCounty"
];

export const PARKING_BASIC_CITIES = ALL_CITIES.filter((city) => city !== "NewTaipei");
export const PARKING_LIVE_CITIES = [
  "Taipei","Taoyuan","Taichung","Tainan","Kaohsiung","Keelung",
  "ChanghuaCounty","YunlinCounty","PingtungCounty","YilanCounty","HualienCounty","KinmenCounty"
];
export const EV_CITY_CITIES = ALL_CITIES.filter((city) => city !== "LienchiangCounty");

export const TTL = {
  parkingBasic: { fresh: 86400, stale: 604800 },
  parkingLive: { fresh: 300, stale: 900 },
  chargingStatic: { fresh: 86400, stale: 604800 },
  chargingLive: { fresh: 300, stale: 900 },
  freewaySections: { fresh: 86400, stale: 604800 },
  freewayLive: { fresh: 300, stale: 900 },
  cctv: { fresh: 86400, stale: 604800 }
};

export const CAPABILITIES = {
  schemaVersion: 1,
  parking: {
    allCities: ALL_CITIES,
    basic: PARKING_BASIC_CITIES,
    availability: PARKING_LIVE_CITIES
  },
  charging: {
    city: EV_CITY_CITIES,
    additionalScopes: ["freeway","tourism","port:TIPC","airport:CAA","airport:TAC","rail:TRA"]
  },
  freeway: {
    sections: true,
    live: true,
    cctv: true,
    xueshanProjection: true
  }
};

export function numericEnv(env, name, fallback) {
  const value = Number(env?.[name]);
  return Number.isFinite(value) ? value : fallback;
}
