import { useCallback, useEffect, useRef, useState } from 'react'

/** Standard BLE Heart Rate GATT service and measurement characteristic. */
const HR_SERVICE = 0x180d
const HR_MEASUREMENT = 0x2a37

export type HrStatus =
  | 'unsupported'
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error'

/**
 * Parse a Heart Rate Measurement value.
 *
 * Bit 0 of the flags byte selects the BPM width: 0 means uint8, 1 means uint16
 * little-endian. Straps differ, so reading the flag is not optional.
 */
export function parseHeartRate(value: DataView): number {
  const flags = value.getUint8(0)
  const is16Bit = (flags & 0x01) !== 0
  return is16Bit ? value.getUint16(1, true) : value.getUint8(1)
}

const MAX_RECONNECT_ATTEMPTS = 5

export function useHeartRate() {
  const [status, setStatus] = useState<HrStatus>('idle')
  const [bpm, setBpm] = useState<number | undefined>()
  const [deviceName, setDeviceName] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>()

  const deviceRef = useRef<BluetoothDevice | null>(null)
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null)
  const attemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intentionalDisconnectRef = useRef(false)

  const supported =
    typeof navigator !== 'undefined' && 'bluetooth' in navigator

  useEffect(() => {
    if (!supported) setStatus('unsupported')
  }, [supported])

  const onCharacteristicChanged = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic
    if (!target.value) return
    setBpm(parseHeartRate(target.value))
  }, [])

  const connectGatt = useCallback(
    async (device: BluetoothDevice) => {
      const server = await device.gatt?.connect()
      if (!server) throw new Error('Could not reach the device')
      const service = await server.getPrimaryService(HR_SERVICE)
      const characteristic = await service.getCharacteristic(HR_MEASUREMENT)
      await characteristic.startNotifications()
      characteristic.addEventListener(
        'characteristicvaluechanged',
        onCharacteristicChanged,
      )
      characteristicRef.current = characteristic
      attemptsRef.current = 0
      setStatus('connected')
      setError(undefined)
    },
    [onCharacteristicChanged],
  )

  const scheduleReconnect = useCallback(() => {
    const device = deviceRef.current
    if (!device || intentionalDisconnectRef.current) return
    if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setStatus('disconnected')
      setError('Lost the strap and could not get it back. Tap to retry.')
      return
    }
    // Backoff: a strap that slipped usually returns within a few seconds, but
    // hammering the radio drains battery for nothing.
    const delay = Math.min(1000 * 2 ** attemptsRef.current, 16000)
    attemptsRef.current += 1
    setStatus('reconnecting')
    reconnectTimerRef.current = setTimeout(() => {
      void connectGatt(device).catch(() => scheduleReconnect())
    }, delay)
  }, [connectGatt])

  const onDisconnected = useCallback(() => {
    setBpm(undefined)
    characteristicRef.current = null
    if (intentionalDisconnectRef.current) {
      setStatus('idle')
      return
    }
    scheduleReconnect()
  }, [scheduleReconnect])

  const connect = useCallback(async () => {
    if (!supported) return
    setStatus('connecting')
    setError(undefined)
    intentionalDisconnectRef.current = false
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HR_SERVICE] }],
        optionalServices: [HR_SERVICE],
      })
      deviceRef.current = device
      setDeviceName(device.name ?? 'Heart rate monitor')
      device.addEventListener('gattserverdisconnected', onDisconnected)
      await connectGatt(device)
    } catch (err) {
      // A cancelled chooser is not an error worth shouting about.
      const name = (err as Error)?.name
      if (name === 'NotFoundError') {
        setStatus('idle')
        return
      }
      setStatus('error')
      setError(
        (err as Error)?.message ?? 'Could not connect to the heart rate monitor',
      )
    }
  }, [supported, connectGatt, onDisconnected])

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    characteristicRef.current?.removeEventListener(
      'characteristicvaluechanged',
      onCharacteristicChanged,
    )
    void characteristicRef.current?.stopNotifications().catch(() => {})
    deviceRef.current?.gatt?.disconnect()
    characteristicRef.current = null
    deviceRef.current = null
    setBpm(undefined)
    setDeviceName(undefined)
    setStatus('idle')
  }, [onCharacteristicChanged])

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      deviceRef.current?.gatt?.disconnect()
    }
  }, [])

  return { status, bpm, deviceName, error, supported, connect, disconnect }
}
