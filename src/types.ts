export type DefectStatus = '待派工' | '整治中' | '待复测' | '复测不合格' | '已关闭'
export type DefectType = '轨距' | '高低' | '方向' | '三角坑'
export type Severity = '一级' | '二级' | '三级'
export type RecordSource = '实时采集' | '晚到补录'
export type EvidenceType = '派工单' | '复测记录' | '改派单' | '现场记录' | '恢复命令' | '纠错单'
export type SpeedEventType = '派工' | '改派' | '纠错' | '恢复'

export interface GeometryMeasurement {
  id: string
  mileage: number
  gauge: number
  level: number
  alignment: number
  twist: number
  measuredAt: string
  detector: string
}

export interface Evidence {
  type: EvidenceType
  docNo: string
  source: RecordSource
  collectedAt: string
  receivedAt: string
  operator: string
  note: string
}

export interface TrackSegment {
  id: string
  line: string
  startMileage: number
  endMileage: number
  speedLimit: number
  temporarySpeedLimit?: number
  version: number
  measurements: GeometryMeasurement[]
}

export interface RectificationAction {
  method: '打磨' | '捣固' | '更换' | '垫板调整' | '测量复核'
  note: string
  operator: string
  recordedAt: string
  source: RecordSource
  evidenceNo: string
  receivedAt: string
}

export interface RetestResult {
  round: number
  passed: boolean
  measuredValue: number
  limit: number
  note: string
  tester: string
  testedAt: string
  source: RecordSource
  evidenceNo: string
  receivedAt: string
}

export interface SpeedEvent {
  id: string
  defectId: string
  segmentId: string
  type: SpeedEventType
  version: number
  formalSpeed: number
  temporarySpeed?: number
  requirement: string
  owner: string
  operator: string
  source: RecordSource
  evidenceNo: string
  note: string
  collectedAt: string
  receivedAt: string
  retestRound?: number
}

export interface ActiveSpeedRecord {
  event: SpeedEvent
  owner: string
}

export interface SegmentSpeedProjection {
  segmentId: string
  activeDefectIds: string[]
  records: ActiveSpeedRecord[]
  formalSpeed: number
  temporarySpeed?: number
  baselineSpeed: number
  restored: boolean
  missingEvidence: boolean
}

export interface Defect {
  id: string
  segmentId: string
  mileage: number
  type: DefectType
  severity: Severity
  measuredValue: number
  limit: number
  status: DefectStatus
  owner: string
  requirement: string
  discoveredAt: string
  dueDate: string
  actions: RectificationAction[]
  retests: RetestResult[]
  version: number
}

export interface AuditEntry {
  id: string
  entityId: string
  action: string
  operator: string
  detail: string
  createdAt: string
}
