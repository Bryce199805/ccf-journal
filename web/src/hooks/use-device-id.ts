import { useState } from 'react'

export function useDeviceId() {
  const [deviceId] = useState(() => {
    let id = localStorage.getItem('ccf_devid')
    if (!id) {
      id = 'xxxx-xxxx-xxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16))
      localStorage.setItem('ccf_devid', id)
    }
    return id
  })

  return deviceId
}
