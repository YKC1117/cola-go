import { describe, expect, it } from "vitest";
import { normalizeParkingBasic, normalizeParkingAvailability } from "../src/normalize/parking.js";
import {
  normalizeChargingStations, normalizeChargingAvailability
} from "../src/normalize/charging.js";
import { normalizeFreewayLive, projectXueshanFromNormalized } from "../src/normalize/freeway.js";
import { normalizeCctv } from "../src/normalize/cctv.js";

describe("parking normalization", () => {
  it("keeps zero spaces distinct from missing", () => {
    const basic=normalizeParkingBasic([{
      CarParkID:"P1",CarParkName:{Zh_tw:"測試停車場"},TotalSpaces:0,
      CarParkPosition:{PositionLat:25,PositionLon:121}
    }],"Taipei")[0];
    expect(basic.totalSpaces).toBe(0);
    expect(basic.name).toBe("測試停車場");

    const live=normalizeParkingAvailability([{
      CarParkID:"P1",AvailableSpaces:0,TotalSpaces:100,DataCollectTime:"2026-09-25T01:00:00+08:00"
    }],"Taipei")[0];
    expect(live.availableSpaces).toBe(0);
    expect(live.totalSpaces).toBe(100);
  });
});

describe("charging normalization", () => {
  it("does not invent a joinable station id", () => {
    const station=normalizeChargingStations([{StationName:{Zh_tw:"匿名站"}}],"Taipei")[0];
    expect(station.joinable).toBe(false);
    expect(station.sourceId).toBeNull();
  });

  it("marks live connector identity quality instead of guessing", () => {
    const reliable=normalizeChargingAvailability([{
      ConnectorID:"C1",StationID:"S1",ChargingPointID:"P1",Status:"Available"
    }],"Taipei")[0];
    expect(reliable.identityQuality).toBe("connector-id");
    expect(reliable.joinable).toBe(true);

    const unreliable=normalizeChargingAvailability([{Status:"Available"}],"Taipei")[0];
    expect(unreliable.identityQuality).toBe("unreliable");
    expect(unreliable.joinable).toBe(false);
  });
});

describe("freeway normalization", () => {
  it("preserves real zero speed but drops sentinel 250", () => {
    const rows=normalizeFreewayLive([
      {SectionID:"A",TravelSpeed:0},
      {SectionID:"B",TravelSpeed:250}
    ]);
    expect(rows[0].speedKph).toBe(0);
    expect(rows[1].speedKph).toBeNull();
  });

  it("projects Snow Tunnel from normalized freeway snapshots", () => {
    const rows=projectXueshanFromNormalized(
      [{id:"N5",roadName:"國道5號",name:"石碇 → 坪林",direction:"S"}],
      [{id:"N5",speedKph:65,sourceUpdatedAt:"2026-09-25T01:00:00+08:00"}]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].speedKph).toBe(65);
  });
});

describe("CCTV normalization", () => {
  it("only exposes http/https media URLs", () => {
    const rows=normalizeCctv([
      {CCTVID:"1",RoadName:"國道1號",VideoStreamURL:"https://example.com/live.m3u8"},
      {CCTVID:"2",RoadName:"國道1號",VideoStreamURL:"javascript:alert(1)"}
    ]);
    expect(rows[0].streamUrl).toBe("https://example.com/live.m3u8");
    expect(rows[1].streamUrl).toBeNull();
    expect(rows[1].displayPolicy).toBe("metadata-only");
  });
});
