async refreshRazerDevices() {
  if (new Date().getTime() < this.lastRefresh + 2000) {
    /// Refresh is called too fast. Wait a bit...
    return;
  }
  this.lastRefresh = new Date().getTime();
  this.closeDevices();

  // --- helpers (local to this method) ---
  const toIntProductId = (pid) => {
    if (pid == null) return null;
    if (typeof pid === 'number') return pid;

    if (typeof pid === 'string') {
      const s = pid.trim().toLowerCase();

      // "0x00c7"
      if (s.startsWith('0x')) {
        const v = parseInt(s, 16);
        return Number.isFinite(v) ? v : null;
      }

      // "199"
      const v10 = parseInt(s, 10);
      return Number.isFinite(v10) ? v10 : null;
    }

    return null;
  };

  const toHex4 = (n) =>
    (typeof n === 'number' && Number.isFinite(n))
      ? `0x${n.toString(16).toUpperCase().padStart(4, '0')}`
      : String(n);

  // --- fetch devices from native addon ---
  const foundDevices = this.addon.getAllDevices();

  // --- log config inventory once per refresh ---
  const configPids = this.razerConfigDevices.map(d => d.productId);
  const configPidSet = new Set(configPids);

  console.log('[RazerDeviceManager] refresh');
  console.log('[RazerDeviceManager] config devices:', this.razerConfigDevices.length);
  console.log(
    '[RazerDeviceManager] config productIds:',
    Array.from(configPidSet).sort((a, b) => a - b).map(toHex4)
  );

  // --- log what native layer sees ---
  console.log('[RazerDeviceManager] addon devices:', foundDevices.length);
  console.log(
    '[RazerDeviceManager] addon list:',
    foundDevices.map(d => ({
      internalDeviceId: d.internalDeviceId,
      productIdRaw: d.productId,
      productIdNum: toIntProductId(d.productId),
      productIdHex: toHex4(toIntProductId(d.productId)),
      // keep these if present; harmless if undefined
      name: d.name,
      productName: d.productName,
    }))
  );

  const devicePromises = foundDevices.map(async (foundDevice) => {
    const foundProductId = toIntProductId(foundDevice.productId);

    if (!Number.isFinite(foundProductId)) {
      console.warn('[RazerDeviceManager] skipping device with invalid productId:', foundDevice);
      return null;
    }

    const configurationDevice = this.razerConfigDevices.find(d => d.productId === foundProductId);

    if (!configurationDevice) {
      console.warn(
        `[RazerDeviceManager] no config match for productId ${toHex4(foundProductId)} (${foundProductId}). ` +
        `Known configs: ${Array.from(configPidSet).map(toHex4).join(', ')}`
      );
      return null;
    }

    const razerProperties = {
      name: configurationDevice.name,
      productId: foundProductId,
      internalId: foundDevice.internalDeviceId,
      mainType: configurationDevice.mainType,
      image: configurationDevice.image,
      features: configurationDevice.features,
      featuresMissing: configurationDevice.featuresMissing,
      featuresConfig: configurationDevice.featuresConfig,
    };

    const razerDevice = this.createRazerDeviceFrom(razerProperties);
    return razerDevice.init();
  });

  return Promise.all(devicePromises)
    .then(devices => devices.filter(device => device !== null))
    .then((devices) => {
      this.activeRazerDevices = this.sortDevices(devices);
    });
}
