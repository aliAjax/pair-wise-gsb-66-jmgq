export function toLocalInput(iso = new Date().toISOString()) {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : new Date().toISOString()
}

export function formatTime(value?: string) {
  return value ? value.replace('T', ' ').slice(0, 16) : '—'
}
