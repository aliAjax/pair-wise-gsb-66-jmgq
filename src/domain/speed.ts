import type { Defect, SpeedDisposition, SpeedDispositionType, SpeedSource } from '../types'

/** 会改变限速值的处置类型；改派、复测维持只留依据，不改变速度 */
export const SPEED_BEARING_TYPES: ReadonlySet<SpeedDispositionType> = new Set(['派工限速', '恢复常速', '纠错'])
/** 晚到判定阈值：采集时间比录入时间早 5 分钟以上视为补录 */
export const LATE_GRACE_MS = 5 * 60 * 1000

export interface SpeedState {
  formalSpeed: number
  temporarySpeed?: number
  /** 当前生效所依据的处置记录；无记录时为基线（整治前速度） */
  record?: SpeedDisposition
  restored: boolean
}

export interface DispatchInput {
  dispatchId: string
  segmentId: string
  defectIds: string[]
  type: SpeedDispositionType
  formalSpeed: number
  temporarySpeed?: number
  workAreaRequirement: string
  owner: string
  collectedAt: string
  operator: string
  basis: string
  originRecordId?: string
}

export function openLevel1Defects(defects: Defect[], segmentId: string): Defect[] {
  return defects.filter((item) => item.segmentId === segmentId && item.severity === '一级' && item.status !== '已关闭')
}

/** 生效顺序：先按采集时间，采集时间相同再按录入时间 —— 采集更早的版本先生效 */
export function sortByCollected<T extends { collectedAt: string; receivedAt: string }>(records: T[]): T[] {
  return [...records].sort((a, b) =>
    a.collectedAt.localeCompare(b.collectedAt) || a.receivedAt.localeCompare(b.receivedAt))
}

export function isLate(collectedAt: string, nowIso = new Date().toISOString()): boolean {
  return new Date(nowIso).getTime() - new Date(collectedAt).getTime() > LATE_GRACE_MS
}

export function nextDispatchId(records: SpeedDisposition[]): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '').slice(2)
  const seq = records.filter((item) => item.dispatchId.startsWith(`DSP-${date}`)).length + 1
  return `DSP-${date}-${String(seq).padStart(2, '0')}`
}

export function dispatchValidation(defects: Defect[], ids: string[], formalSpeed: number, temporarySpeed: number | undefined, requirement: string, owner: string, basis: string): string | null {
  if (!ids.length) return '请选择需要派工的缺陷'
  const targets = defects.filter((item) => ids.includes(item.id))
  if (targets.length !== ids.length) return '存在已不存在的缺陷'
  const segmentIds = new Set(targets.map((item) => item.segmentId))
  if (segmentIds.size !== 1) return '一次派工只能选择同一区段的缺陷'
  if (!owner.trim()) return '责任工区不能为空'
  if (!formalSpeed || formalSpeed <= 0) return '正式限速必须为正数'
  const hasOpenLevel1 = targets.some((item) => item.severity === '一级' && item.status !== '已关闭')
    || openLevel1Defects(defects, targets[0].segmentId).length > 0
  if (hasOpenLevel1 && (temporarySpeed === undefined || temporarySpeed <= 0)) return '区段存在未关闭一级缺陷，必须设置临时限速'
  if (hasOpenLevel1 && temporarySpeed! >= formalSpeed) return '临时限速必须低于正式限速'
  if (!requirement.trim()) return '工区要求（完成时限、防护要求）不能为空'
  if (!basis.trim()) return '派工依据（调度命令/通知单编号）不能为空'
  return null
}

/**
 * 追加式受理一条处置记录：
 * - 永不修改、删除已有记录；
 * - 同一派工链路上重复保存“派工限速”（含晚到的更早版本）只留档，不覆盖已生效版本；
 * - 需要变更时走“纠错”另存版本，原记录仍可在时间线中查询。
 */
export function ingestDisposition(records: SpeedDisposition[], input: DispatchInput, receivedAt = new Date().toISOString()): SpeedDisposition {
  const source: SpeedSource = isLate(input.collectedAt, receivedAt) ? '补录' : '实时'
  const record: SpeedDisposition = {
    ...input,
    id: `SPD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    receivedAt,
    source
  }
  if (input.type === '派工限速') {
    const existing = records.find((item) => item.dispatchId === input.dispatchId && SPEED_BEARING_TYPES.has(item.type) && !item.overrideBlocked)
    if (existing) {
      record.overrideBlocked = `该派工已有生效版本（${existing.id}，采集于 ${existing.collectedAt.replace('T', ' ').slice(0, 16)}，临时限速 ${existing.temporarySpeed ?? '恢复常速'} km/h）；后到内容不得覆盖，仅作补录留档，变更请使用“纠错”另存版本。`
    }
  }
  return record
}

function speedBearing(records: SpeedDisposition[]): SpeedDisposition[] {
  return sortByCollected(records.filter((item) => SPEED_BEARING_TYPES.has(item.type) && !item.overrideBlocked))
}

/** 某一时刻的生效限速：取采集时间不晚于该时刻的最后一条速度处置 */
export function speedAt(records: SpeedDisposition[], baselineSpeed: number, atIso: string): SpeedState {
  const last = speedBearing(records).filter((item) => item.collectedAt <= atIso).at(-1)
  if (!last) return { formalSpeed: baselineSpeed, restored: false }
  if (last.type === '恢复常速') return { formalSpeed: baselineSpeed, restored: true, record: last }
  return { formalSpeed: last.formalSpeed, temporarySpeed: last.temporarySpeed, restored: false, record: last }
}

export function currentSpeed(records: SpeedDisposition[], baselineSpeed: number, nowIso = new Date().toISOString()): SpeedState {
  return speedAt(records, baselineSpeed, nowIso)
}

export type RetestClosePlan =
  | { action: '恢复常速'; reason: string }
  | { action: '复测维持'; reason: string }

/**
 * 复测关闭判定：同区段只剩最后一个未关闭一级缺陷、且本次复测将其关闭时，才恢复整治前速度；
 * 多个一级缺陷集中时即使本缺陷通过也维持临时限速（防止提前放行）。
 * 传入的 remainingOpenLevel1 为“本次复测通过并关闭之后”区段内仍未关闭的一级缺陷数量。
 */
export function planRetestClose(remainingOpenLevel1: number): RetestClosePlan {
  return remainingOpenLevel1 === 0
    ? { action: '恢复常速', reason: '同区段最后一个未关闭一级缺陷复测关闭，恢复至整治前速度' }
    : { action: '复测维持', reason: `同区段仍有 ${remainingOpenLevel1} 个一级缺陷未关闭，维持临时限速，不得提前放行` }
}

export function findDispatchId(records: SpeedDisposition[], defectId: string): string | undefined {
  return sortByCollected(records).filter((item) => item.defectIds.includes(defectId)).at(-1)?.dispatchId
}

/* ---------- datetime-local 与 ISO 的转换 ---------- */

export function toLocalInput(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): string {
  return value ? new Date(value).toISOString() : new Date().toISOString()
}

export function fmt(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16)
}
