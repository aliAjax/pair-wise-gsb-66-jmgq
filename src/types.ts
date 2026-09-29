export type DefectStatus = '待派工' | '整治中' | '待复测' | '复测不合格' | '已关闭'
export type DefectType = '轨距' | '高低' | '方向' | '三角坑'
export type Severity = '一级' | '二级' | '三级'

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

export interface TrackSegment {
  id: string
  line: string
  startMileage: number
  endMileage: number
  /** 整治前正式限速（基线速度），恢复常速时回到该值 */
  speedLimit: number
  /** 兼容旧版本展示；当前是否在限速由限速处置记录推导 */
  temporarySpeedLimit?: number
  /** 区段资料版本（里程/检测数据变化时递增） */
  version: number
  measurements: GeometryMeasurement[]
}

export interface RectificationAction {
  method: '打磨' | '捣固' | '更换' | '垫板调整' | '测量复核'
  note: string
  operator: string
  /** 采集时间（现场作业实际发生时间，晚到补录可能早于录入时间） */
  recordedAt: string
  /** 录入时间（系统收到时间，补录依据） */
  receivedAt?: string
  /** 依据：补录原因、现场照片/单据编号等 */
  basis?: string
}

export interface RetestResult {
  round: number
  passed: boolean
  measuredValue: number
  limit: number
  note: string
  tester: string
  testedAt: string
  /** 录入时间（晚到补录依据） */
  receivedAt?: string
  /** 复测依据：仪器编号、报告编号、复测地点确认等 */
  basis?: string
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
  discoveredAt: string
  dueDate: string
  actions: RectificationAction[]
  retests: RetestResult[]
  version: number
}

/** 限速处置类型：派工保存 / 复测维持 / 恢复常速 / 改派 / 纠错 */
export type SpeedDispositionType = '派工限速' | '复测维持' | '恢复常速' | '改派' | '纠错'
/** 来源：实时录入或晚到补录（补录永不覆盖已生效记录） */
export type SpeedSource = '实时' | '补录'

export interface SpeedDisposition {
  id: string
  /** 同一次派工限速的标识；复测维持、恢复常速、改派、纠错都挂在同一派工链路上 */
  dispatchId: string
  /** 纠错/改派指向的原始记录 id；原始记录保留可查 */
  originRecordId?: string
  segmentId: string
  /** 涉及的一级缺陷；改派时为改派缺陷集合 */
  defectIds: string[]
  type: SpeedDispositionType
  /** 正式限速 km/h（派工时保存） */
  formalSpeed: number
  /** 临时限速 km/h（派工时保存；恢复常速时为 undefined） */
  temporarySpeed?: number
  /** 工区要求（派工时保存：完成时限、防护要求等） */
  workAreaRequirement: string
  /** 责任工区；改派记录中为改派后的工区 */
  owner: string
  /** 现场采集时间（业务发生时间，版本生效以此为准排序） */
  collectedAt: string
  /** 系统收到/录入时间 */
  receivedAt: string
  source: SpeedSource
  operator: string
  basis: string
  /** 后到内容尝试覆盖已生效记录时被阻止的原因；不影响生效顺序 */
  overrideBlocked?: string
}

export interface AuditEntry {
  id: string
  entityId: string
  action: string
  operator: string
  detail: string
  createdAt: string
}
