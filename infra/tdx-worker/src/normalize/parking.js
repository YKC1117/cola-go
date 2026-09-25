import { localizedName, numberOrNull, positionOf, uniqueById } from "./common.js";

export function normalizeParkingBasic(items, city) {
  return uniqueById(items.map((x) => {
    const id = String(x.CarParkID || x.ParkingID || "");
    if (!id) return null;
    const p = positionOf(x.CarParkPosition || x.Position || x);
    return {
      id: `${city}:${id}`,
      sourceId: id,
      city,
      name: localizedName(x.CarParkName) || id,
      address: x.Address || x.CarParkAddress || null,
      lat: p.lat,
      lon: p.lon,
      totalSpaces: numberOrNull(x.TotalSpaces ?? x.NumberOfSpaces),
      feeText: x.FareDescription || x.FareDescriptionText || null,
      hasLiveAvailability: Boolean(x.LiveOccupancyAvailable ?? x.LiveOccuppancyAvailable)
    };
  }).filter(Boolean));
}

export function normalizeParkingAvailability(items, city) {
  return uniqueById(items.map((x) => {
    const sourceId = String(x.CarParkID || x.ParkingID || "");
    if (!sourceId) return null;
    let totalSpaces = numberOrNull(x.TotalSpaces);
    let availableSpaces = numberOrNull(x.AvailableSpaces);
    if (Array.isArray(x.Availabilities) && x.Availabilities.length) {
      const car = x.Availabilities.find((v) => Number(v.SpaceType) === 1) || x.Availabilities[0];
      totalSpaces ??= numberOrNull(car.NumberOfSpaces ?? car.NumberOfSpace);
      availableSpaces ??= numberOrNull(car.AvailableSpaces ?? car.AvailableSpace);
    }
    return {
      id: `${city}:${sourceId}`,
      sourceId,
      city,
      availableSpaces,
      totalSpaces,
      serviceStatus: x.ServiceStatus ?? null,
      fullStatus: x.FullStatus ?? null,
      sourceUpdatedAt: x.DataCollectTime || x.UpdateTime || null
    };
  }).filter(Boolean));
}
