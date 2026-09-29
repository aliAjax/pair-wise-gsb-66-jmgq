import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { seedAudit, seedDefects, seedSegments, seedSpeedEvents } from '../data/seed'
import type { AuditEntry, Defect, DefectStatus, EvidenceType, RectificationAction, RecordSource, RetestResult, SpeedEvent, TrackSegment } from '../types'
import { activeLevelOneDefects, effectiveSpeedEvent, hasDispatchRecord, latestInstructionEvent, latestSpeedVersion, projectSegmentSpeed, restoreEventExists } from '../domain/speed'

const STORAGE_KEY = 'gsb66:track-geometry:v2'
const LEGACY_STORAGE_KEY = 'gsb66:track-geometry'
let idSeed = 100

interface Result { ok: boolean; message: string }

interface AssignInput {
  owner: string
  requirement: string
  formalSpeed: number
  temporarySpeed?: number
  source: RecordSource
  evidenceNo: string
  collectedAt: string
  operator: string
}

interface CorrectionInput {
  formalSpeed: number
  temporarySpeed?: number
  requirement: string
  operator: string
  source: RecordSource
  evidenceNo: string
  collectedAt: string
  reason: string
}

interface ReassignInput {
  owner: string
  requirement: string
  operator: string
  source: RecordSource
  evidenceNo: string
  collectedAt: string
  reason: string
}

type EvidenceMeta = { source: RecordSource; evidenceNo: string; collectedAt: string; operator: string }

function nowIso() {
  return new Date().toISOString()
}

function createSpeedEvent(input: Omit<SpeedEvent, 'id'>): SpeedEvent {
  return { ...input, id: `SE-${Date.now()}-${idSeed++}` }
}

function normalizeDefect(defect: Defect): Defect {
  return {
    ...defect,
    requirement: defect.requirement ?? '',
    version: defect.version ?? 1,
    actions: (defect.actions ?? []).map((action) => ({
      ...action,
      source: action.source ?? '实时采集',
      evidenceNo: action.evidenceNo ?? `LEGACY-${defect.id}-A`,
      receivedAt: action.receivedAt ?? action.recordedAt
    })),
    retests: (defect.retests ?? []).map((retest) => ({
      ...retest,
      source: retest.source ?? '实时采集',
      evidenceNo: retest.evidenceNo ?? `LEGACY-${defect.id}-R${retest.round}`,
      receivedAt: retest.receivedAt ?? retest.testedAt
    }))
  }
}

function legacyMigration(raw: { segments: TrackSegment[]; defects: Defect[]; audit: AuditEntry[] }) {
  const defects = raw.defects.map(normalizeDefect)
  const speedEvents: SpeedEvent[] = []
  for (const defect of defects) {
    const active = activeLevelOneDefects(defect.segmentId, defects).some((item) => item.id === defect.id)
    if (defect.severity === '一级' && active && raw.segments.some((segment) => segment.id === defect.segmentId)) {
      const segment = raw.segments.find((item) => item.id === defect.segmentId)!
      speedEvents.push({
        id: `SE-LEGACY-${defect.id}`,
        defectId: defect.id,
        segmentId: defect.segmentId,
        type: '派工',
        version: 1,
        formalSpeed: segment.speedLimit,
        temporarySpeed: segment.temporarySpeedLimit ?? Math.max(20, segment.speedLimit - 40),
        requirement: defect.requirement || '历史数据迁移：按派工单工区要求补录',
        owner: defect.owner,
        operator: '系统迁移',
        source: '晚到补录',
        evidenceNo: `LEGACY-PG-${defect.id}`,
        note: '由旧版本地数据迁移生成，原始采集与接收时间保留在审计中',
        collectedAt: defect.discoveredAt,
        receivedAt: nowIso()
      })
    }
    if (defect.severity === '一级' && defect.status === '已关闭') {
      const passed = defect.retests.find((retest) => retest.passed)
      const segment = raw.segments.find((item) => item.id === defect.segmentId)
      if (passed && segment) {
        speedEvents.push({
          id: `SE-LEGACY-RESTORE-${defect.id}`,
          defectId: defect.id,
          segmentId: defect.segmentId,
          type: '恢复',
          version: 2,
          formalSpeed: segment.speedLimit,
          requirement: `恢复至整治前速度${segment.speedLimit}km/h`,
          owner: defect.owner,
          operator: '系统迁移',
          source: '晚到补录',
          evidenceNo: `LEGACY-HF-${defect.id}`,
          note: '历史关闭一级缺陷迁移恢复依据',
          collectedAt: passed.testedAt,
          receivedAt: nowIso(),
          retestRound: passed.round
        })
      }
    }
  }
  return { segments: raw.segments, defects, audit: raw.audit, speedEvents }
}

function load(): { segments: TrackSegment[]; defects: Defect[]; audit: AuditEntry[]; speedEvents: SpeedEvent[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        segments: parsed.segments ?? seedSegments,
        defects: (parsed.defects ?? seedDefects).map(normalizeDefect),
        audit: parsed.audit ?? seedAudit,
        speedEvents: parsed.speedEvents ?? seedSpeedEvents
      }
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) return legacyMigration(JSON.parse(legacy))
  } catch {
    // 数据损坏时回落到内置样例，避免现场页面无法操作。
  }
  return { segments: structuredClone(seedSegments), defects: structuredClone(seedDefects), audit: structuredClone(seedAudit), speedEvents: structuredClone(seedSpeedEvents) }
}

export const useTrackStore = defineStore('track', () => {
  const initial = load()
  const segments = ref<TrackSegment[]>(initial.segments)
  const defects = ref<Defect[]>(initial.defects)
  const audit = ref<AuditEntry[]>(initial.audit)
  const speedEvents = ref<SpeedEvent[]>(initial.speedEvents)
  const keyword = ref('')
  const status = ref<DefectStatus | '全部'>('全部')
  const selectedSegmentId = ref(segments.value[0]?.id ?? '')

  const filtered = computed(() => defects.value.filter((item) => {
    const segment = segments.value.find((value) => value.id === item.segmentId)
    const text = `${item.id} ${segment?.line ?? ''} ${item.type} ${item.owner} ${item.requirement}`.toLowerCase()
    return (!keyword.value || text.includes(keyword.value.toLowerCase())) && (status.value === '全部' || item.status === status.value)
  }))
  const selectedSegment = computed(() => segments.value.find((item) => item.id === selectedSegmentId.value))
  const speedProjections = computed(() => Object.fromEntries(segments.value.map((segment) => [segment.id, projectSegmentSpeed(segment, defects.value, speedEvents.value)])))

  function speedForSegment(segmentId: string) {
    return speedProjections.value[segmentId] ?? projectSegmentSpeed(segments.value.find((item) => item.id === segmentId)!, defects.value, speedEvents.value)
  }

  function effectiveEventForDefect(defectId: string) {
    return effectiveSpeedEvent(speedEvents.value, defectId)
  }

  function addAudit(entityId: string, action: string, operator: string, detail: string) {
    audit.value.unshift({ id: `A-${Date.now()}-${idSeed++}`, entityId, action, operator, detail, createdAt: nowIso() })
  }

  function evidenceDetail(type: EvidenceType, input: EvidenceMeta, extra: string) {
    return `${type} ${input.evidenceNo}｜${input.source}｜采集 ${input.collectedAt.replace('T', ' ').slice(0, 16)}｜${extra}`
  }

  function assign(defectIds: string[], input: AssignInput): Result {
    if (!defectIds.length) return { ok: false, message: '请先选择需要派工的缺陷' }
    const targetDefects = defectIds.map((id) => defects.value.find((item) => item.id === id)).filter((item): item is Defect => Boolean(item))
    if (targetDefects.some((defect) => defect.status === '已关闭')) return { ok: false, message: '已关闭缺陷不能派工' }
    if (targetDefects.some((defect) => hasDispatchRecord(speedEvents.value, defect.id))) return { ok: false, message: '已有正式派工限速记录；改派或纠错请另办单据' }
    if (!input.owner || !input.requirement || !input.evidenceNo || !input.collectedAt) return { ok: false, message: '工区、工区要求、单据号和采集时间必须齐全' }
    if (!Number.isFinite(input.formalSpeed) || input.formalSpeed <= 0) return { ok: false, message: '正式限速必须大于0' }
    if (targetDefects.some((defect) => defect.severity === '一级') && (!input.temporarySpeed || input.temporarySpeed >= input.formalSpeed)) return { ok: false, message: '一级缺陷必须设置低于正式限速的临时限速' }

    for (const defect of targetDefects) {
      const temporarySpeed = defect.severity === '一级' ? input.temporarySpeed : undefined
      speedEvents.value.unshift(createSpeedEvent({
        defectId: defect.id,
        segmentId: defect.segmentId,
        type: '派工',
        version: 1,
        formalSpeed: input.formalSpeed,
        temporarySpeed,
        requirement: input.requirement,
        owner: input.owner,
        operator: input.operator,
        source: input.source,
        evidenceNo: input.evidenceNo,
        note: '派工时保存正式限速、临时限速和工区要求',
        collectedAt: input.collectedAt,
        receivedAt: nowIso()
      }))
      defect.owner = input.owner
      defect.requirement = input.requirement
      defect.status = '整治中'
      defect.version += 1
      addAudit(defect.id, '派工限速登记', input.operator, evidenceDetail('派工单', input, `正式${input.formalSpeed}km/h${temporarySpeed ? `，临时${temporarySpeed}km/h` : ''}`))
    }
    return { ok: true, message: '派工及限速处置记录已保存' }
  }

  function reassign(id: string, input: ReassignInput): Result {
    const defect = defects.value.find((item) => item.id === id)
    if (!defect) return { ok: false, message: '缺陷不存在' }
    if (defect.status === '已关闭') return { ok: false, message: '已关闭缺陷不能改派' }
    const current = effectiveSpeedEvent(speedEvents.value, id)
    if (!current) return { ok: false, message: '缺少原派工限速依据，不能改派' }
    if (!input.owner || !input.requirement || !input.evidenceNo || !input.reason) return { ok: false, message: '新工区、要求、改派单号和原因必须齐全' }

    const nextVersion = latestSpeedVersion(speedEvents.value, id) + 1
    speedEvents.value.unshift(createSpeedEvent({
      defectId: id,
      segmentId: defect.segmentId,
      type: '改派',
      version: nextVersion,
      formalSpeed: current.formalSpeed,
      temporarySpeed: current.temporarySpeed,
      requirement: input.requirement,
      owner: input.owner,
      operator: input.operator,
      source: input.source,
      evidenceNo: input.evidenceNo,
      note: `改派依据：${input.reason}；沿用已生效限速`,
      collectedAt: input.collectedAt,
      receivedAt: nowIso()
    }))
    defect.owner = input.owner
    defect.requirement = input.requirement
    defect.version += 1
    addAudit(id, '改派留痕', input.operator, evidenceDetail('改派单', input, `由${current.owner}改派至${input.owner}，原因：${input.reason}`))
    return { ok: true, message: '改派已另存版本，原派工记录保留' }
  }

  function correctSpeed(id: string, input: CorrectionInput): Result {
    const defect = defects.value.find((item) => item.id === id)
    if (!defect) return { ok: false, message: '缺陷不存在' }
    if (defect.status === '已关闭') return { ok: false, message: '已关闭缺陷不能纠错限速' }
    if (!hasDispatchRecord(speedEvents.value, id)) return { ok: false, message: '缺少派工记录，不能纠错' }
    if (!input.requirement || !input.evidenceNo || !input.reason) return { ok: false, message: '工区要求、纠错单号和原因必须齐全' }
    if (!Number.isFinite(input.formalSpeed) || input.formalSpeed <= 0) return { ok: false, message: '正式限速必须大于0' }
    if (defect.severity === '一级' && (!input.temporarySpeed || input.temporarySpeed >= input.formalSpeed)) return { ok: false, message: '一级缺陷临时限速必须低于正式限速' }

    const nextVersion = latestSpeedVersion(speedEvents.value, id) + 1
    speedEvents.value.unshift(createSpeedEvent({
      defectId: id,
      segmentId: defect.segmentId,
      type: '纠错',
      version: nextVersion,
      formalSpeed: input.formalSpeed,
      temporarySpeed: defect.severity === '一级' ? input.temporarySpeed : undefined,
      requirement: input.requirement,
      owner: latestInstructionEvent(speedEvents.value, id)?.owner ?? defect.owner,
      operator: input.operator,
      source: input.source,
      evidenceNo: input.evidenceNo,
      note: `纠错另存V${nextVersion}：${input.reason}；原速度版本保留可查`,
      collectedAt: input.collectedAt,
      receivedAt: nowIso()
    }))
    defect.requirement = input.requirement
    defect.version += 1
    addAudit(id, '限速纠错', input.operator, evidenceDetail('纠错单', input, `正式${input.formalSpeed}km/h${input.temporarySpeed ? `，临时${input.temporarySpeed}km/h` : ''}；${input.reason}`))
    return { ok: true, message: `已另存纠错版本V${nextVersion}，原速度仍可查` }
  }

  function addAction(id: string, action: RectificationAction): Result {
    const defect = defects.value.find((item) => item.id === id)
    if (!defect) return { ok: false, message: '缺陷不存在' }
    const closed = defect.status === '已关闭'
    if (!action.note || !action.evidenceNo || !action.recordedAt) return { ok: false, message: '现场记录、单据号和采集时间必须齐全' }
    defect.actions = [...defect.actions, { ...action, receivedAt: nowIso() }].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    if (!closed) defect.status = '待复测'
    defect.version += 1
    addAudit(id, closed ? '晚到整治依据归档' : '提交整治记录', action.operator, evidenceDetail('现场记录', { source: action.source, evidenceNo: action.evidenceNo, collectedAt: action.recordedAt, operator: action.operator }, `${action.method}：${action.note}${closed ? '；缺陷已关闭，不覆盖处置结果' : ''}`))
    return { ok: true, message: closed ? '晚到记录已归档，原关闭结果不变' : '整治记录已作为依据保存' }
  }

  function addRetest(id: string, retest: RetestResult): Result {
    const defect = defects.value.find((item) => item.id === id)
    if (!defect) return { ok: false, message: '缺陷不存在' }
    const closed = defect.status === '已关闭'
    if (!closed && !defect.actions.length) return { ok: false, message: '缺少整治记录，不能提交复测' }
    if (defect.retests.some((item) => item.round === retest.round && item.evidenceNo === retest.evidenceNo)) return { ok: false, message: '同一复测单据已存在，不能重复入帐' }
    if (!retest.note || !retest.evidenceNo || !retest.testedAt) return { ok: false, message: '复测说明、单据号和采集时间必须齐全' }

    const receivedAt = nowIso()
    defect.retests = [...defect.retests, { ...retest, receivedAt }].sort((a, b) => a.round - b.round || a.testedAt.localeCompare(b.testedAt))
    if (!closed) defect.status = retest.passed ? '已关闭' : '复测不合格'
    defect.version += 1
    const retestEvidence = { source: retest.source, evidenceNo: retest.evidenceNo, collectedAt: retest.testedAt, operator: retest.tester }
    addAudit(id, closed ? '晚到复测依据归档' : '提交复测', retest.tester, evidenceDetail('复测记录', retestEvidence, `第${retest.round}轮${retest.passed ? '通过' : '未通过'}：${retest.note}${closed ? '；缺陷已关闭，不覆盖处置结果' : ''}`))

    if (!closed && retest.passed && defect.severity === '一级') {
      const remaining = activeLevelOneDefects(defect.segmentId, defects.value)
      if (remaining.length === 0) {
        if (restoreEventExists(speedEvents.value, id, retest.round)) {
          addAudit(id, '恢复拦截', '系统', `第${retest.round}轮恢复命令已存在，禁止重复恢复`)
        } else {
          const segment = segments.value.find((item) => item.id === defect.segmentId)
          const version = latestSpeedVersion(speedEvents.value, id) + 1
          speedEvents.value.unshift(createSpeedEvent({
            defectId: id,
            segmentId: defect.segmentId,
            type: '恢复',
            version,
            formalSpeed: segment?.speedLimit ?? retest.limit,
            requirement: `恢复至整治前速度${segment?.speedLimit ?? retest.limit}km/h`,
            owner: defect.owner,
            operator: retest.tester,
            source: retest.source,
            evidenceNo: retest.evidenceNo,
            note: `第${retest.round}轮复测通过，同区段最后一个未关闭一级缺陷已关闭`,
            collectedAt: retest.testedAt,
            receivedAt,
            retestRound: retest.round
          }))
          addAudit(defect.segmentId, '自动恢复限速', '系统', evidenceDetail('恢复命令', retestEvidence, `最后一个一级缺陷关闭，恢复整治前速度${segment?.speedLimit ?? retest.limit}km/h`))
        }
      } else {
        addAudit(defect.segmentId, '保持临时限速', '系统', `仍有${remaining.length}个一级缺陷未关闭：${remaining.map((item) => item.id).join('、')}`)
      }
    }
    return { ok: true, message: closed ? '晚到复测已归档，原处置结果不变' : retest.passed ? '复测通过，已按区段一级缺陷状态判断是否恢复' : '复测不合格，保持处置状态' }
  }

  function reset() {
    segments.value = structuredClone(seedSegments)
    defects.value = structuredClone(seedDefects)
    audit.value = structuredClone(seedAudit)
    speedEvents.value = structuredClone(seedSpeedEvents)
  }

  watch([segments, defects, audit, speedEvents], () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ segments: segments.value, defects: defects.value, audit: audit.value, speedEvents: speedEvents.value }))
  }, { deep: true })

  return {
    segments, defects, audit, speedEvents, keyword, status, selectedSegmentId,
    filtered, selectedSegment, speedProjections,
    assign, reassign, correctSpeed, addAction, addRetest, effectiveEventForDefect, speedForSegment, reset
  }
})
