function normalizeDriverCapacityText(value) {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

function inferDriverCapacityValue(driver) {
  if (!driver || typeof driver !== 'object') return '';

  const directCandidates = [
    driver.capacity,
    driver.tonnage,
    driver.ton,
    driver.tonNum,
    driver.tonnageValue,
    driver.availableCapacity,
    driver.operableCapacity,
    driver.supportedCapacity,
    driver.craneCapacity,
    driver.maxCapacity,
    driver.maxTonnage,
    driver.type,
    driver.craneType,
    driver.possibleType,
    driver.possibility,
    driver.equipment,
    driver.spec,
    driver.regType,
    driver.driverType,
    driver.user?.craneType,
    driver.user?.type,
    driver.possibleCraneType,
    driver.vehicleType,
    driver.licenseType,
    driver.availableType,
    driver.workType,
    driver.crane_type,
    driver.possible_type,
    driver.craneTypeName,
    driver.machineType,
    driver.operableType,
    driver.regCraneType,
    driver.availableTypes
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeDriverCapacityText(candidate);
    if (!normalized) continue;

    const match = normalized.match(/(\d+(?:\.\d+)?)\s*(톤|ton)/i);
    if (match) {
      return `${match[1]}톤`;
    }

    const explicitMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(ton|tons|t)/i);
    if (explicitMatch) {
      return `${explicitMatch[1]}톤`;
    }

    const pureNumberMatch = normalized.match(/^(\d+(?:\.\d+)?)$/);
    if (pureNumberMatch) {
      return `${pureNumberMatch[1]}톤`;
    }
  }

  return '';
}

module.exports = {
  inferDriverCapacityValue
};
