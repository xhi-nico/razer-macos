const storage = require('electron-json-storage');

export class SettingsManager {
  async getSettingsFor(device) {
    if (await this.hasKey(device.getSettingsKey())) {
      return this.getKey(device.getSettingsKey());
    }
    return device.getDefaultSettings();
  }

  async saveSettingsFor(device) {
    return this.setKey(device.getSettingsKey(), device.settings);
  }

  async hasKey(key) {
    return new Promise((res, rej) => {
      storage.has(key, (error, hasKey) => {
        if (error) {
          return rej(error);
        }
        res(hasKey);
      });
    });
  }

  async setKey(key, value) {
    return new Promise((res, rej) => {
      storage.set(key, value, (err) => {
        if (err) {
          return rej(err);
        }
        res();
      });
    });
  }

  // For writes that must land before the app quits. A missing key reads as {}.
  setKeySync(key, value) {
    storage.setSync(key, value);
  }

  getKeySync(key) {
    return storage.getSync(key);
  }

  async getKey(key) {
    return new Promise((res, rej) => {
      storage.get(key, (err, data) => {
        if (err) {
          return rej(err);
        }
        res(data);
      });
    });
  }

  async clearAll() {
    return new Promise((res, rej) => {
      storage.clear((err) => {
        if (err) {
          return rej(err);
        }
        res();
      });
    });
  }
}