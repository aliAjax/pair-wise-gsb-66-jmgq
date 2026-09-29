import type { Defect, SpeedEvent, TrackSegment } from '../types'

const SPEED_EVENT_TYPES: SpeedEvent['type'][] = ['派工', '改派', '纠错']

export function isDefectClosed(defect: Defect) {
  return defect.status === '已关闭'
}

export function isActiveLevelOne(defect: Defect) {
  return defect.severity === '一级' && !isDefectClosed(defect)
}

export function speedEventsForDefect(events: SpeedEvent[], defectId: string) {
  return events
    .filter((event) => event.defectId === defectId && SPEED_EVENT_TYPES.includes(event.type))
    .sort((a, b) => b.version - a.version || a.collectedAt.localeCompare(b.collectedAt) || a.receivedAt.localeCompare(b.receivedAt))
}

export function effectiveSpeedEvent(events: SpeedEvent[], defectId: string) {
  return speedEventsForDefect(events, defectId)[0]
}

export function latestInstructionEvent(events: SpeedEvent[], defectId: string) {
  return events
    .filter((event) => event.defectId === defectId && SPEED_EVENT_TYPES.includes(event.type))
    .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt) || b.receivedAt.localeCompare(a.receivedAt))[0]
}

export function latestSpeedVersion(events: SpeedEvent[], defectId: string) {
  return events.filter((event) => event.defectId === defectId).reduce((max, event) => Math.max(max, event.version), 0)
}

export function hasDispatchRecord(events: SpeedEvent[], defectId: string) {
  return events.some((event) => event.defectId === defectId && event.type === '派工')
}

export function activeLevelOneDefects(segmentId: string, defects: Defect[]) {
  return defects.filter((defect) => defect.segmentId === segmentId && isActiveLevelOne(defect))
}

export function projectSegmentSpeed(segment: TrackSegment, defects: Defect[], events: SpeedEvent[]) {
  const activeDefects = activeLevelOneDefects(segment.id, defects)
  const records = activeDefects.map((defect) => ({ defect, event: effectiveSpeedEvent(events, defect.id) }))
  const missingEvidence = records.some((record) => !record.event || !record.event.temporarySpeed)
  const effectiveEvents = records.flatMap((record) => record.event ? [record.event] : [])
  const formalSpeed = effectiveEvents.length ? Math.min(...effectiveEvents.map((event) => event.formalSpeed)) : segment.speedLimit
  const temporarySpeed = missingEvidence || !effectiveEvents.length
    ? undefined
    : Math.min(...effectiveEvents.map((event) => event.temporarySpeed as number))

  return {
    segmentId: segment.id,
    activeDefectIds: activeDefects.map((defect) => defect.id),
    records: records.map(({ defect, event }) => ({
      event: event as SpeedEvent,
      owner: latestInstructionEvent(events, defect.id)?.owner ?? defect.owner
    })).filter((record) => record.event),
    formalSpeed,
    temporarySpeed,
    baselineSpeed: segment.speedLimit,
    restored: activeDefects.length === 0,
    missingEvidence
  }
}

export function restoreNeededForDefect(defectId: string, defects: Defect[]) {
  const defect = defects.find((item) => item.id === defectId)
  if (!defect || defect.severity !== '一级' || isDefectClosed(defect)) return false
  return activeLevelOneDefects(defect.segmentId, defects).length === 1
}

export function restoreEventExists(events: SpeedEvent[], defectId: string, retestRound: number) {
  return events.some((event) => event.defectId === defectId && event.type === '恢复' && event.retestRound === retestRound)
}
