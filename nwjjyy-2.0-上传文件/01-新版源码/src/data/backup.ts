export function backupStamp(isoDate: string) {
  return isoDate.slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
}
