import {BaseAdapter} from "./BaseAdapter.js";

export class HifiBerryAdapter extends BaseAdapter {
  constructor(baseUrl = "http://localhost:3000") {
    super();
    this.baseUrl = baseUrl;
  }

  async getVolume() {
    const response = await fetch(`${this.baseUrl}/api/volume`);
    if (!response.ok) throw new Error("Failed to get volume");
    const data = await response.json();
    return data.volume;
  }

  async setVolume(volume) {
    const response = await fetch(`${this.baseUrl}/api/volume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ volume }),
    });
    if (!response.ok) throw new Error("Failed to set volume");
  }

  async play() {
    const response = await fetch(`${this.baseUrl}/api/player/play`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("Failed to play");
  }

  async pause() {
    const response = await fetch(`${this.baseUrl}/api/player/pause`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("Failed to pause");
  }

  async getStatus() {
    const response = await fetch(`${this.baseUrl}/api/player/status`);
    if (!response.ok) throw new Error("Failed to get status");
    return response.json();
  }
}
