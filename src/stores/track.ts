import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { seedAudit, seedDefects, seedDispositions, seedSegments } from '../data/seed'
import type { AuditEntry, Defect, DefectStatus, RectificationAction, RetestResult, SpeedDisposition, TrackSegment } from '../types'
import {
  currentSpeed,
  dispatchValidation,
  findDispatchId,
  ingestDisposition,
  openLevel1Defects,
  planRetestClose,
  sortByCollected,
  type DispatchInput
} from '../domain/speed'

const STORAGE_KEY = 'gsb66:track-geometry'
let idSeed = 10

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        segments: parsed.segments ?? seedSegments,
        defects: parsed.defects ?? seedDefects,
        dispositions: parsed.dispositions ?? seedDispositions,
        audit: parsed.audit ?? seedAudit
      }
    }
  } catch {
    /* 存储损坏时回落到种子数据 */
  }
  return { segments: seedSegments, defects: seedDefects, dispositions: seedDispositions, audit: seedAudit }
}

export interface DispatchParams {
  defectIds: string[]
  owner: string
  formalSpeed: number
  temporarySpeed?: number
  workAreaRequirement: string
  collectedAt: string
  operator: string
  basis: string
  dispatchId?: string
}

export const useTrackStore = defineStore('track', () => {
  const initial = load()
  const segments = ref<TrackSegment[]>(initial.segments)
  const defects = ref<Defect[]>(initial.defects)
  const dispositions = ref<SpeedDisposition[]>(initial.dispositions)
  const audit = ref<AuditEntry[]>(initial.audit)
  const keyword = ref('')
  const status = ref<DefectStatus | '全部'>('全部')
  const selectedSegmentId = ref(segments.value[0]?.id ?? '')

  const filtered = computed(() => defects.value.filter((item) => {
    const segment = segments.value.find((value) => value.id === item.segmentId)
    const text = `${item.id} ${segment?.line ?? ''} ${item.type} ${item.owner}`.toLowerCase()
    return (!keyword.value || text.includes(keyword.value.toLowerCase())) && (status.value === '全部' || item.status === status.value)
  }))

  const selectedSegment = computed(() => segments.value.find((item) => item.id === selectedSegmentId.value))

  function segmentDispositions(segmentId: string): SpeedDisposition[] {
    return sortByCollected(dispositions.value.filter((item) => item.segmentId === segmentId))
  }

  function segmentSpeed(segmentId: string) {
    const segment = segments.value.find((item) => item.id === segmentId)
    if (!segment) return undefined
    return currentSpeed(dispositions.value.filter((item) => item.segmentId === segmentId), segment.speedLimit)
  }

  function addAudit(entityId: string, action: string, operator: string, detail: string) {
    audit.value.unshift({ id: `A-${Date.now()}-${idSeed++}`, entityId, action, operator, detail, createdAt: new Date().toISOString() })
  }

  /**
   * 派工：保存正式限速、临时限速和工区要求（限速处置记录）。
   * 无调度命令等依据时拒绝；重复派工只留档、不覆盖已生效版本（由 domain 层判定）。
   */
  function dispatch(params: DispatchParams): { ok: boolean; message: string } {
    const { defectIds, owner, formalSpeed, temporarySpeed, workAreaRequirement, collectedAt, operator, basis } = params
    const error = dispatchValidation(defects.value, defectIds, formalSpeed, temporarySpeed, workAreaRequirement, owner, basis)
    if (error) return { ok: false, message: error }

    const segmentId = defects.value.find((item) => item.id === defectIds[0])!.segmentId
    const dispatchId = params.dispatchId ?? ingestId(segmentId, defectIds)
    const input: DispatchInput = {
      dispatchId, segmentId, defectIds, type: '派工限速', formalSpeed, temporarySpeed,
      workAreaRequirement, owner, collectedAt, operator, basis
    }
    const record = ingestDisposition(dispositions.value, input)
    dispositions.value.unshift(record)

    for (const id of defectIds) {
      const defect = defects.value.find((item) => item.id === id)
      if (!defect) continue
      defect.owner = owner
      defect.status = '整治中'
      defect.version += 1
    }
    syncSegmentTemporary(segmentId)

    if (record.overrideBlocked) {
      addAudit(dispatchId, '后到补录已阻止覆盖', operator, record.overrideBlocked)
      return { ok: true, message: '已留档，但未覆盖已生效记录；如需变更请用“纠错”另存版本' }
    }
    addAudit(dispatchId, '派工限速', operator, `正式限速${formalSpeed} km/h，临时限速${temporarySpeed ?? '无'} km/h，责任${owner}，依据：${basis}`)
    return { ok: true, message: `派工已保存：正式${formalSpeed}/临时${temporarySpeed ?? '—'} km/h，处置版本 ${record.id}` }
  }

  function ingestId(segmentId: string, defectIds: string[]): string {
    const existing = defectIds.map((id) => findDispatchId(dispositions.value, id)).find((id) => !!id)
    return existing ?? `DSP-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${dispositions.value.length + 1}`
  }

  /** 兼容缺陷列表上的简易批量派工（非一级缺陷、不涉限速） */
  function assign(defectIds: string[], owner: string) {
    for (const id of defectIds) {
      const defect = defects.value.find((item) => item.id === id)
      if (!defect) continue
      defect.owner = owner
      defect.status = '整治中'
      defect.version += 1
      addAudit(id, '批量派工', '当前用户', `任务分配至${owner}`)
    }
  }

  /** 改派：责任工区变更，限速要求沿用并留依据 */
  function reassign(defectId: string, owner: string, basis: string, collectedAt = new Date().toISOString()): { ok: boolean; message: string } {
    const defect = defects.value.find((item) => item.id === defectId)
    if (!defect) return { ok: false, message: '缺陷不存在' }
    if (!owner.trim()) return { ok: false, message: '改派工区不能为空' }
    if (!basis.trim()) return { ok: false, message: '改派必须填写依据（命令编号/原因）' }
    const speed = segmentSpeed(defect.segmentId)
    const dispatchId = findDispatchId(dispositions.value, defectId) ?? ingestId(defect.segmentId, [defectId])
    const chain = dispositions.value.filter((item) => item.dispatchId === dispatchId && item.type === '派工限速' && !item.overrideBlocked)
    const base = sortByCollected(chain).at(-1)
    const input: DispatchInput = {
      dispatchId, segmentId: defect.segmentId, defectIds: [defectId], type: '改派',
      formalSpeed: base?.formalSpeed ?? speed?.formalSpeed ?? segments.value.find((s) => s.id === defect.segmentId)!.speedLimit,
      temporarySpeed: base?.temporarySpeed ?? speed?.temporarySpeed,
      workAreaRequirement: base?.workAreaRequirement ?? '沿用原派工要求',
      owner, collectedAt, operator: '当前用户', basis, originRecordId: base?.id
    }
    const record = ingestDisposition(dispositions.value, input)
    dispositions.value.unshift(record)
    const previous = defect.owner
    defect.owner = owner
    defect.version += 1
    addAudit(dispatchId, '改派', '当前用户', `${defectId} 由${previous}改派至${owner}，限速不变，依据：${basis}`)
    return { ok: true, message: `已改派至${owner}，改派依据已留存，限速要求不变` }
  }

  function addAction(id: string, action: RectificationAction) {
    const defect = defects.value.find((item) => item.id === id)
    if (!defect) return
    const recorded: RectificationAction = { ...action, receivedAt: new Date().toISOString() }
    defect.actions.unshift(recorded)
    defect.status = '待复测'
    defect.version += 1
    addAudit(id, '提交整治记录', action.operator, `${action.method}：${action.note}${action.basis ? `（依据：${action.basis}）` : ''}`)
  }

  /**
   * 复测：
   * - 复测必须填写依据（仪器/报告编号）；
   * - 通过并关闭时，只有同区段最后一个未关闭一级缺陷被关闭，才生成“恢复常速”记录；
   *   仍有其他一级缺陷集中时生成“复测维持”，防止提前放行。
   */
  function addRetest(id: string, retest: RetestResult) {
    const defect = defects.value.find((item) => item.id === id)
    if (!defect) return { ok: false, message: '缺陷不存在' }
    if (!retest.basis?.trim()) return { ok: false, message: '复测必须填写依据（仪器/报告编号）' }

    const stored: RetestResult = { ...retest, receivedAt: new Date().toISOString() }
    defect.retests.unshift(stored)
    defect.version += 1

    if (!retest.passed) {
      defect.status = '复测不合格'
      addAudit(id, '提交复测', retest.tester, `第${retest.round}轮未通过（依据：${retest.basis}）`)
      return { ok: true, message: '复测不合格，任务重新进入整治，临时限速维持不变' }
    }

    defect.status = '已关闭'
    let message = '复测通过，缺陷已关闭'

    if (defect.severity === '一级') {
      const remaining = openLevel1Defects(defects.value, defect.segmentId).length
      const plan = planRetestClose(remaining)
      const speed = segmentSpeed(defect.segmentId)!
      const dispatchId = findDispatchId(dispositions.value, id) ?? ingestId(defect.segmentId, [id])
      const origin = sortByCollected(dispositions.value.filter((d) => d.dispatchId === dispatchId && d.type === '派工限速' && !d.overrideBlocked)).at(-1)

      if (plan.action === '恢复常速') {
        restoreSpeed(dispatchId, defect.segmentId, [id], retest.tester, `复测报告 ${retest.basis}：${plan.reason}`, retest.testedAt, origin?.id)
        message = '复测通过：同区段最后一个一级缺陷关闭，已恢复至整治前速度'
      } else {
        const input: DispatchInput = {
          dispatchId, segmentId: defect.segmentId, defectIds: [id], type: '复测维持',
          formalSpeed: speed.formalSpeed, temporarySpeed: speed.temporarySpeed,
          workAreaRequirement: origin?.workAreaRequirement ?? '维持原派工要求',
          owner: defect.owner, collectedAt: retest.testedAt, operator: retest.tester,
          basis: `复测报告 ${retest.basis}：${plan.reason}`, originRecordId: origin?.id
        }
        dispositions.value.unshift(ingestDisposition(dispositions.value, input))
        addAudit(dispatchId, '复测维持限速', retest.tester, `${id} 复测通过但区段仍有 ${remaining} 个一级缺陷未关闭，维持 ${speed.temporarySpeed} km/h（依据：${retest.basis}）`)
        message = `复测通过，但区段仍有 ${remaining} 个一级缺陷未关闭，继续维持临时限速 ${speed.temporarySpeed} km/h`
      }
    } else {
      addAudit(id, '提交复测', retest.tester, `复测通过并关闭（依据：${retest.basis}）`)
    }
    return { ok: true, message }
  }

  function restoreSpeed(dispatchId: string, segmentId: string, defectIds: string[], operator: string, basis: string, collectedAt: string, originRecordId?: string): SpeedDisposition {
    const input: DispatchInput = {
      dispatchId, segmentId, defectIds, type: '恢复常速', formalSpeed: segments.value.find((s) => s.id === segmentId)!.speedLimit,
      workAreaRequirement: '', owner: '', collectedAt, operator, basis, originRecordId
    }
    const record = ingestDisposition(dispositions.value, input)
    dispositions.value.unshift(record)
    syncSegmentTemporary(segmentId)
    addAudit(dispatchId, '恢复常速', operator, basis)
    return record
  }

  /** 手动恢复：仅当同区段已无未关闭一级缺陷时允许 */
  function restoreNormal(segmentId: string, basis: string, collectedAt = new Date().toISOString()): { ok: boolean; message: string } {
    const open = openLevel1Defects(defects.value, segmentId)
    if (open.length) return { ok: false, message: `仍有 ${open.length} 个一级缺陷未关闭，禁止提前恢复常速` }
    if (!basis.trim()) return { ok: false, message: '恢复常速必须填写依据（销点命令编号）' }
    const speed = segmentSpeed(segmentId)!
    if (speed.restored || speed.temporarySpeed === undefined) return { ok: false, message: '当前已是整治前速度，无需恢复' }
    const dispatchId = speed.record?.dispatchId ?? sortByCollected(dispositions.value.filter((d) => d.segmentId === segmentId)).at(-1)?.dispatchId ?? `DSP-RST-${segmentId}`
    restoreSpeed(dispatchId, segmentId, speed.record?.defectIds ?? [], '当前用户', basis, collectedAt, speed.record?.id)
    return { ok: true, message: '已恢复至整治前速度' }
  }

  /** 纠错：不改动原记录，另存一条纠错版本；纠错版本进入时间线成为最新生效处置 */
  function correctDisposition(recordId: string, formalSpeed: number, temporarySpeed: number | undefined, basis: string, collectedAt = new Date().toISOString()): { ok: boolean; message: string } {
    const origin = dispositions.value.find((item) => item.id === recordId)
    if (!origin) return { ok: false, message: '原记录不存在' }
    if (!formalSpeed || formalSpeed <= 0) return { ok: false, message: '正式限速必须为正数' }
    const openCount = openLevel1Defects(defects.value, origin.segmentId).length
    if (openCount > 0 && (temporarySpeed === undefined || temporarySpeed <= 0 || temporarySpeed >= formalSpeed)) {
      return { ok: false, message: `区段仍有 ${openCount} 个一级缺陷未关闭，纠错临时限速必须为低于正式限速的正数` }
    }
    if (!basis.trim()) return { ok: false, message: '纠错必须填写依据（核对命令/测量复核单）' }

    const input: DispatchInput = {
      dispatchId: origin.dispatchId, segmentId: origin.segmentId, defectIds: origin.defectIds, type: '纠错',
      formalSpeed, temporarySpeed: openCount > 0 ? temporarySpeed : undefined,
      workAreaRequirement: origin.workAreaRequirement, owner: origin.owner, collectedAt,
      operator: '当前用户', basis: `对 ${origin.id} 的纠错：${basis}`, originRecordId: origin.id
    }
    const record = ingestDisposition(dispositions.value, input)
    dispositions.value.unshift(record)
    syncSegmentTemporary(origin.segmentId)
    addAudit(origin.dispatchId, '限速纠错另存版本', '当前用户', `原记录 ${origin.id}（正式${origin.formalSpeed}/临时${origin.temporarySpeed ?? '—'}）保留可查；纠错版本 ${record.id}：正式${formalSpeed}/临时${temporarySpeed ?? '—'}，依据：${basis}`)
    return { ok: true, message: `纠错版本 ${record.id} 已生效，原速度记录仍可在版本链中查询` }
  }

  /** 区段资料/判断分离：页面只读当前速度；兼容旧字段 temporarySpeedLimit */
  function syncSegmentTemporary(segmentId: string) {
    const segment = segments.value.find((item) => item.id === segmentId)
    if (!segment) return
    const speed = segmentSpeed(segmentId)!
    segment.temporarySpeedLimit = speed.temporarySpeed
  }

  function transition(id: string, next: DefectStatus) {
    const defect = defects.value.find((item) => item.id === id)
    if (!defect) return { ok: false, message: '缺陷不存在' }
    if (next === '已关闭' && (!defect.retests.length || !defect.retests.some((item) => item.passed))) return { ok: false, message: '没有合格复测记录，不能关闭' }
    if (next === '待复测' && !defect.actions.length) return { ok: false, message: '缺少整治记录，不能申请复测' }
    const previous = defect.status
    defect.status = next
    defect.version += 1
    addAudit(id, `状态流转：${next}`, '当前用户', `由${previous}流转至${next}`)
    return { ok: true, message: `已流转至${next}` }
  }

  /** 保留旧的手工速度版本入口（当前由处置记录推导，此方法仅用于资料维护） */
  function updateSegmentSpeed(id: string, speed: number, temporary: number | undefined) {
    const segment = segments.value.find((item) => item.id === id)
    if (!segment) return { ok: false, message: '区段不存在' }
    const conflict = defects.value.some((item) => item.segmentId === id && item.status !== '已关闭' && item.severity === '一级')
    if (conflict && (!temporary || temporary >= speed)) return { ok: false, message: '一级缺陷未关闭时必须设置更低临时限速' }
    segment.speedLimit = speed
    segment.temporarySpeedLimit = temporary
    segment.version += 1
    addAudit(id, '更新区段资料版本', '工务调度', `整治前正式限速（基线）${speed} km/h，临时${temporary ?? '无'}`)
    return { ok: true, message: '区段资料版本已更新' }
  }

  function reset() {
    segments.value = structuredClone(seedSegments)
    defects.value = structuredClone(seedDefects)
    dispositions.value = structuredClone(seedDispositions)
    audit.value = structuredClone(seedAudit)
  }

  watch([segments, defects, audit, dispositions], () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      segments: segments.value, defects: defects.value, dispositions: dispositions.value, audit: audit.value
    }))
  }, { deep: true })

  return {
    segments, defects, dispositions, audit, keyword, status, selectedSegmentId,
    filtered, selectedSegment,
    segmentDispositions, segmentSpeed, openLevel1: (segmentId: string) => openLevel1Defects(defects.value, segmentId),
    dispatch, assign, reassign, addAction, addRetest, restoreNormal, correctDisposition,
    transition, updateSegmentSpeed, reset
  }
})
