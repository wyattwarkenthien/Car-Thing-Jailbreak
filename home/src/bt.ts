// Talks to the Bluetooth helper (bt/bthelper.py) running on the Car Thing at 127.0.0.1:8737.

export interface BtDevice { mac: string; name: string; connected?: boolean }
export interface BtPrompt { kind: 'confirm' | 'authorize' | 'display' | 'pin'; passkey?: string; mac?: string; name?: string }
export interface BtStatus {
  ok: boolean
  controller: boolean
  powered: boolean
  discoverable: boolean
  name: string
  address: string
  scanning: boolean
  prompt: BtPrompt | null
  busy: { mac: string; action: string } | null
  message: string
  paired: BtDevice[]
  found: BtDevice[]
}

const BASE = 'http://127.0.0.1:8737/api/'

export function btApi(path: string, cb?: (r: BtStatus | null) => void) {
  try {
    const x = new XMLHttpRequest()
    x.open('GET', BASE + path, true)
    x.timeout = 5000
    x.onload = () => { let r: BtStatus | null = null; try { r = JSON.parse(x.responseText) } catch (e) { /* */ } if (cb) cb(r) }
    x.onerror = x.ontimeout = () => { if (cb) cb(null) }
    x.send()
  } catch (e) { if (cb) cb(null) }
}
