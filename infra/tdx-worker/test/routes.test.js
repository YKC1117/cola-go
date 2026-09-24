import { describe, expect, it } from "vitest";
import { matchRoute, upstreamSpec } from "../src/routes.js";

describe("route validation", () => {
  it("accepts supported parking city", () => {
    const route=matchRoute(new URL("https://api.example/api/v1/parking/Taipei"));
    expect(route.kind).toBe("parkingBasic");
    expect(route.scope).toBe("city:Taipei");
    expect(upstreamSpec(route).path).toBe("/v1/Parking/OffStreet/CarPark/City/Taipei");
  });

  it("rejects parking basic city not listed by TDX", () => {
    expect(()=>matchRoute(new URL("https://api.example/api/v1/parking/NewTaipei"))).toThrowError(/does not list/);
  });

  it("rejects unsupported parking availability city", () => {
    expect(()=>matchRoute(new URL("https://api.example/api/v1/parking/Hsinchu/availability"))).toThrowError(/does not list/);
  });

  it("requires charging scope", () => {
    expect(()=>matchRoute(new URL("https://api.example/api/v1/charging/stations"))).toThrowError(/scope is required/);
  });

  it("accepts charging city scope and maps exact endpoint", () => {
    const route=matchRoute(new URL("https://api.example/api/v1/charging/connectors?scope=city:Kaohsiung"));
    expect(route.kind).toBe("chargingConnectors");
    expect(route.scope).toBe("city:Kaohsiung");
    expect(upstreamSpec(route).path).toBe("/v1/EV/Connector/City/Kaohsiung");
  });

  it("rejects Lienchiang EV scope because official City endpoint does not list it", () => {
    expect(()=>matchRoute(new URL("https://api.example/api/v1/charging/stations?scope=city:LienchiangCounty"))).toThrowError(/does not list/);
  });

  it("rejects arbitrary OData or unknown query", () => {
    expect(()=>matchRoute(new URL("https://api.example/api/v1/freeway/live?$filter=x"))).toThrowError(/Unsupported query/);
  });

  it("maps freeway endpoints without guessing versions", () => {
    const route=matchRoute(new URL("https://api.example/api/v1/freeway/cctv"));
    expect(route.kind).toBe("freewayCctv");
    expect(upstreamSpec(route).path).toBe("/v2/Road/Traffic/CCTV/Freeway");
  });
});
