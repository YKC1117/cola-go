import { localizedName, numberOrNull, positionOf, uniqueById } from "./common.js";

function connectorSummary(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((x) => ({
    type: x.ConnectorType || x.Type || x.ChargingType || null,
    maxPowerKw: numberOrNull(x.MaxPower ?? x.MaxPowerKW ?? x.Power)
  }));
}

export function normalizeChargingStations(items, city) {
  return uniqueById(items.map((x, index) => {
    const sourceId = String(x.StationID || x.ChargingStationID || "");
    const id = sourceId ? `${city}:${sourceId}` : `${city}:station-unjoined-${index}`;
    const p = positionOf(x.StationPosition || x.Position || x);
    return {
      id,
      sourceId: sourceId || null,
      scope: `city:${city}`,
      name: localizedName(x.StationName) || localizedName(x.Name) || sourceId || "充電站",
      operatorId: x.OperatorID || x.OperatorId || null,
      address: x.Address || null,
      lat: p.lat,
      lon: p.lon,
      connectorSummary: connectorSummary(x.Connectors || x.ConnectorTypes),
      hoursText: x.ServiceTime || x.OperationTime || null,
      joinable: Boolean(sourceId)
    };
  }));
}

export function normalizeChargingPoints(items, city) {
  return items.map((x, index) => {
    const sourceId = String(x.ChargingPointID || x.PointID || "");
    const stationId = x.StationID || x.ChargingStationID || null;
    return {
      id: sourceId ? `${city}:${sourceId}` : `${city}:point-unjoined-${index}`,
      sourceId: sourceId || null,
      stationId,
      operatorId: x.OperatorID || null,
      floor: x.Floor || x.FloorDescription || null,
      feeText: x.ChargingFee || x.FeeDescription || null,
      connectorSummary: connectorSummary(x.Connectors),
      joinable: Boolean(sourceId && stationId)
    };
  });
}

export function normalizeChargingConnectors(items, city) {
  return items.map((x, index) => {
    const sourceId = String(x.ConnectorID || "");
    const stationId = x.StationID || x.ChargingStationID || null;
    const chargingPointId = x.ChargingPointID || null;
    return {
      id: sourceId ? `${city}:${sourceId}` : `${city}:connector-unjoined-${index}`,
      sourceId: sourceId || null,
      stationId,
      chargingPointId,
      type: x.ConnectorType || x.Type || null,
      currentType: x.CurrentType || null,
      maxPowerKw: numberOrNull(x.MaxPower ?? x.MaxPowerKW ?? x.Power),
      joinable: Boolean(sourceId && (stationId || chargingPointId))
    };
  });
}

export function normalizeChargingAvailability(items, city) {
  return items.map((x, index) => {
    const sourceId = String(x.ConnectorID || "");
    const stationId = x.StationID || x.ChargingStationID || null;
    const chargingPointId = x.ChargingPointID || null;
    const joinable = Boolean(sourceId || (stationId && chargingPointId));
    return {
      id: sourceId ? `${city}:${sourceId}` : `${city}:availability-unjoined-${index}`,
      stationId,
      chargingPointId,
      connectorType: x.ConnectorType || x.Type || null,
      state: x.Status || x.ConnectorStatus || x.AvailabilityStatus || "unknown",
      sourceUpdatedAt: x.DataCollectTime || x.UpdateTime || null,
      identityQuality: sourceId ? "connector-id" : joinable ? "station-point" : "unreliable",
      joinable
    };
  });
}
