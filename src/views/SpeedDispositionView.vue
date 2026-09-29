<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTrackStore } from '../stores/track'
import { fmt, fromLocalInput, speedAt, toLocalInput, type SpeedState } from '../domain/speed'
import type { SpeedDisposition } from '../types'

const route = useRoute()
const router = useRouter()
const store = useTrackStore()

const preselect = computed(() => {
  const raw = route.query.defects
  return raw ? String(raw).split(',').filter(Boolean) : []
})

const segmentId = ref(String(route.params.id || store.selectedSegmentId || store.segments[0]?.id || ''))
watch(segmentId, (value) => { store.selectedSegmentId = value })

const segment = computed(() => store.segments.find((item) => item.id === segmentId.value))
const segmentDefects = computed(() => store.defects.filter((item) => item.segmentId === segmentId.value))
const openLevel1 = computed(() => store.openLevel1(segmentId.value))
const records = computed(() => store.segmentDispositions(segmentId.value))
const speed = computed<SpeedState | undefined>(() => store.segmentSpeed(segmentId.value))

// 派工限速表单
const dispatchForm = reactive({
  defectIds: [] as string[],
  owner: '工务一工区',
  formalSpeed: 160,
  temporarySpeed: 100 as number | undefined,
  workAreaRequirement: '',
  collectedAt: toLocalInput(new Date().toISOString()),
  operator: '调度员 方林',
  basis: ''
})
const dispatchMessage = ref('')

watch(segment, (value) => {
  dispatchForm.formalSpeed = value?.speedLimit ?? 160
  dispatchForm.temporarySpeed = undefined
}, { immediate: true })

watch(preselect, (ids) => {
  if (ids.length) dispatchForm.defectIds = [...ids]
}, { immediate: true })

const candidates = computed(() => segmentDefects.value.filter((item) => item.status !== '已关闭'))

function submitDispatch() {
  const result = store.dispatch({
    defectIds: dispatchForm.defectIds,
    owner: dispatchForm.owner,
    formalSpeed: Number(dispatchForm.formalSpeed),
    temporarySpeed: dispatchForm.temporarySpeed === undefined || dispatchForm.temporarySpeed === ('' as any) ? undefined : Number(dispatchForm.temporarySpeed),
    workAreaRequirement: dispatchForm.workAreaRequirement,
    collectedAt: fromLocalInput(dispatchForm.collectedAt),
    operator: dispatchForm.operator,
    basis: dispatchForm.basis
  })
  dispatchMessage.value = result.message
  if (result.ok) {
    dispatchForm.workAreaRequirement = ''
    dispatchForm.basis = ''
    dispatchForm.defectIds = []
    router.replace({ query: {} })
  }
}

// 恢复常速
const restoreBasis = ref('')
const restoreCollectedAt = ref(toLocalInput(new Date().toISOString()))
const restoreMessage = ref('')
function restore() {
  const result = store.restoreNormal(segmentId.value, restoreBasis.value, fromLocalInput(restoreCollectedAt.value))
  restoreMessage.value = result.message
  if (result.ok) restoreBasis.value = ''
}

// 纠错
const correcting = ref<SpeedDisposition | null>(null)
const correction = reactive({ formalSpeed: 0, temporarySpeed: undefined as number | undefined, basis: '', collectedAt: '' })
function openCorrection(record: SpeedDisposition) {
  correcting.value = record
  correction.formalSpeed = record.formalSpeed
  correction.temporarySpeed = record.temporarySpeed
  correction.basis = ''
  correction.collectedAt = toLocalInput(new Date().toISOString())
}
function submitCorrection() {
  if (!correcting.value) return
  const result = store.correctDisposition(
    correcting.value.id,
    Number(correction.formalSpeed),
    correction.temporarySpeed === undefined || correction.temporarySpeed === ('' as any) ? undefined : Number(correction.temporarySpeed),
    correction.basis,
    fromLocalInput(correction.collectedAt)
  )
  correctionMessage.value = result.message
  if (result.ok) { correcting.value = null; correctionMessage.value = result.message }
}
const correctionMessage = ref('')

// 历史时刻查询（资料、判断、页面分离：页面用纯函数查询）
const queryAt = ref(toLocalInput(new Date().toISOString()))
const historical = computed(() => {
  if (!segment.value || !queryAt.value) return undefined
  return speedAt(store.dispositions.filter((d) => d.segmentId === segmentId.value), segment.value.speedLimit, fromLocalInput(queryAt.value))
})

const typeColor: Record<string, string> = {
  派工限速: 'warning', 复测维持: 'amber-darken-3', 恢复常速: 'success', 改派: 'info', 纠错: 'secondary'
}

function recordChip(record: SpeedDisposition): { text: string; color: string } {
  if (record.overrideBlocked) return { text: '后到未覆盖', color: 'error' }
  if (record.source === '补录') return { text: '补录已生效', color: 'teal' }
  return { text: record.source, color: 'default' }
}
</script>

<template>
  <section class="page">
    <div class="split">
      <div class="segment-list">
        <button v-for="item in store.segments" :key="item.id" :class="{ active: item.id === segmentId }" @click="segmentId = item.id">
          <span>{{ item.id }}</span>
          <strong>{{ item.line }}</strong>
          <small>整治前 {{ item.speedLimit }} km/h · 当前 {{ speed?.temporarySpeed ?? item.speedLimit }} km/h</small>
          <small>未关闭一级缺陷 {{ openLevel1.length }} 个</small>
        </button>
      </div>

      <div v-if="segment" class="speed-main">
        <div class="section-head">
          <div>
            <span>{{ segment.id }} · 资料版本 V{{ segment.version }}</span>
            <h2>{{ segment.line }} 限速处置记录</h2>
            <p>派工保存正式限速、临时限速与工区要求；同区段最后一个一级缺陷关闭才恢复整治前速度。</p>
          </div>
          <v-chip :color="speed?.temporarySpeed ? 'error' : 'success'" size="large">
            当前生效：{{ speed?.temporarySpeed ?? speed?.formalSpeed }} km/h<template v-if="speed?.temporarySpeed"> 临时限速</template><template v-else> 整治前速度</template>
          </v-chip>
        </div>

        <div class="state-strip">
          <div><span>整治前正式限速（基线）</span><strong>{{ segment.speedLimit }} km/h</strong></div>
          <div><span>当前正式限速</span><strong>{{ speed?.formalSpeed }} km/h</strong></div>
          <div><span>当前临时限速</span><strong :class="{ hot: speed?.temporarySpeed }">{{ speed?.temporarySpeed ?? '—' }} km/h</strong></div>
          <div><span>未关闭一级缺陷</span><strong :class="{ hot: openLevel1.length }">{{ openLevel1.length }} 个</strong><small v-for="d in openLevel1" :key="d.id">{{ d.id }} </small></div>
          <div><span>生效依据</span><strong class="basis-name">{{ speed?.record?.type ?? '基线（无处置）' }}</strong></div>
        </div>

        <!-- 派工限速 -->
        <div class="panel">
          <h3>派工时保存限速处置</h3>
          <p class="hint">正式限速、临时限速和工区要求一次保存；有未关闭一级缺陷时临时限速必须低于正式限速。</p>
          <v-select v-model="dispatchForm.defectIds" :items="candidates.map((d) => ({ title: `${d.id} ${d.type} ${d.severity}（${d.status}）`, value: d.id }))"
            multiple chips density="compact" variant="outlined" hide-details label="本次派工缺陷（同一区段）" />
          <div class="form-grid dispatch-grid">
            <v-select v-model="dispatchForm.owner" :items="['工务一工区', '工务二工区', '桥隧工区']" label="责任工区" density="compact" variant="outlined" hide-details />
            <v-text-field v-model.number="dispatchForm.formalSpeed" type="number" label="正式限速 km/h" density="compact" variant="outlined" hide-details />
            <v-text-field v-model.number="dispatchForm.temporarySpeed" type="number" label="临时限速 km/h" density="compact" variant="outlined" hide-details clearable />
            <v-text-field v-model="dispatchForm.collectedAt" type="datetime-local" label="采集时间" density="compact" variant="outlined" hide-details />
            <v-text-field v-model="dispatchForm.operator" label="派工人" density="compact" variant="outlined" hide-details />
            <v-text-field v-model="dispatchForm.basis" label="依据：限速调度命令/通知单编号" density="compact" variant="outlined" hide-details />
          </div>
          <v-textarea v-model="dispatchForm.workAreaRequirement" label="工区要求（完成时限、驻站联络、移动减速信号牌等防护要求）" density="compact" variant="outlined" rows="2" hide-details class="req" />
          <div class="form-actions">
            <v-btn color="primary" @click="submitDispatch">保存限速处置</v-btn>
            <span v-if="dispatchMessage" class="message">{{ dispatchMessage }}</span>
          </div>
        </div>

        <!-- 恢复常速 -->
        <div class="panel restore-panel" :class="{ locked: openLevel1.length }">
          <h3>恢复整治前速度</h3>
          <p class="hint">同区段只剩最后一个未关闭一级缺陷并复测关闭后才能恢复；仍有一级缺陷集中时按钮锁定，防止提前放行。</p>
          <div class="form-grid restore-grid">
            <v-text-field v-model="restoreCollectedAt" type="datetime-local" label="销点采集时间" density="compact" variant="outlined" hide-details :disabled="!!openLevel1.length" />
            <v-text-field v-model="restoreBasis" label="依据：销点命令/复测报告编号" density="compact" variant="outlined" hide-details :disabled="!!openLevel1.length" />
            <v-btn color="success" :disabled="!!openLevel1.length" @click="restore">恢复至整治前速度 {{ segment.speedLimit }} km/h</v-btn>
          </div>
          <p v-if="openLevel1.length" class="locked-note">锁定中：{{ openLevel1.length }} 个一级缺陷未关闭（{{ openLevel1.map((d) => d.id).join('、') }}），禁止提前恢复。</p>
          <span v-if="restoreMessage" class="message">{{ restoreMessage }}</span>
        </div>

        <!-- 版本链 -->
        <div class="panel">
          <h3>处置版本链（按采集时间生效，只追加不改写）</h3>
          <v-table density="compact">
            <thead>
              <tr><th>生效序</th><th>类型</th><th>正式/临时 km/h</th><th>工区要求</th><th>采集 / 录入</th><th>来源</th><th>依据</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="(record, index) in [...records].reverse()" :key="record.id" :class="{ blocked: record.overrideBlocked, activeRow: speed?.record?.id === record.id }">
                <td>{{ records.length - index }}</td>
                <td>
                  <v-chip size="small" :color="typeColor[record.type]">{{ record.type }}</v-chip>
                  <div v-if="record.originRecordId" class="link-note">源自 {{ record.originRecordId }}</div>
                </td>
                <td>{{ record.formalSpeed }} / {{ record.temporarySpeed ?? '—' }}</td>
                <td class="req-cell">{{ record.workAreaRequirement || '—' }}<small v-if="record.owner">责任：{{ record.owner }}</small></td>
                <td class="time-cell">{{ fmt(record.collectedAt) }}<small>录入 {{ fmt(record.receivedAt) }}</small></td>
                <td><v-chip size="small" :color="recordChip(record).color">{{ recordChip(record).text }}</v-chip></td>
                <td class="basis-cell">{{ record.basis }}<small v-if="record.overrideBlocked" class="blocked-text">{{ record.overrideBlocked }}</small></td>
                <td><v-btn size="small" variant="outlined" :disabled="record.type === '恢复常速'" @click="openCorrection(record)">纠错另存</v-btn></td>
              </tr>
            </tbody>
          </v-table>
          <p class="hint">纠错不改动原记录，另存新版本进入生效链；原速度记录始终可查。后到的更早采集版本只留档，不覆盖已生效记录。</p>
        </div>

        <!-- 历史时刻查询 -->
        <div class="panel query-panel">
          <h3>历史时刻限速查询</h3>
          <div class="form-grid query-grid">
            <v-text-field v-model="queryAt" type="datetime-local" label="查询时刻" density="compact" variant="outlined" hide-details />
            <div class="query-result">
              正式 <strong>{{ historical?.formalSpeed }}</strong> km/h ·
              临时 <strong :class="{ hot: historical?.temporarySpeed }">{{ historical?.temporarySpeed ?? '—' }}</strong> km/h
              <small v-if="historical?.record">依据 {{ historical.record.type }}（{{ historical.record.id }}）</small>
              <small v-else>依据基线（整治前速度）</small>
            </div>
          </div>
        </div>
      </div>
    </div>

    <v-dialog :model-value="!!correcting" max-width="620" @update:model-value="(v: boolean) => !v && (correcting = null)">
      <v-card v-if="correcting" class="correction-card">
        <v-card-title>限速纠错（另存版本，原记录保留）</v-card-title>
        <v-card-text>
          <p class="hint">原记录 {{ correcting.id }}：正式 {{ correcting.formalSpeed }} / 临时 {{ correcting.temporarySpeed ?? '—' }} km/h，采集于 {{ fmt(correcting.collectedAt) }}。纠错版本进入生效链，原记录仍可查询。</p>
          <div class="form-grid">
            <v-text-field v-model.number="correction.formalSpeed" type="number" label="纠错后正式限速 km/h" density="compact" variant="outlined" hide-details />
            <v-text-field v-model.number="correction.temporarySpeed" type="number" label="纠错后临时限速 km/h" density="compact" variant="outlined" hide-details clearable />
            <v-text-field v-model="correction.collectedAt" type="datetime-local" label="采集时间" density="compact" variant="outlined" hide-details />
          </div>
          <v-text-field v-model="correction.basis" label="纠错依据（核对命令/测量复核单编号）" density="compact" variant="outlined" hide-details />
          <span v-if="correctionMessage" class="message">{{ correctionMessage }}</span>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="correcting = null">取消</v-btn>
          <v-btn color="secondary" @click="submitCorrection">另存纠错版本</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.split { display: grid; grid-template-columns: 300px 1fr; gap: 14px; align-items: start; }
.segment-list { display: grid; gap: 8px; }
.segment-list button { background: white; border: 1px solid #dae1e2; padding: 13px; text-align: left; display: grid; gap: 6px; cursor: pointer; border-radius: 4px; }
.segment-list button.active { border-color: #315b72; box-shadow: inset 3px 0 #315b72; }
.segment-list span, .segment-list small { color: #748180; font-size: 11px; }
.speed-main { display: grid; gap: 14px; }
.section-head { display: flex; justify-content: space-between; gap: 14px; background: white; border: 1px solid #dae1e2; padding: 16px 18px; }
.section-head span { color: #738180; font-size: 11px; }.section-head h2 { margin: 4px 0; font-size: 20px; }.section-head p { margin: 0; color: #60706f; font-size: 12px; }
.state-strip { display: grid; grid-template-columns: repeat(5, 1fr); background: white; border: 1px solid #dae1e2; }
.state-strip > div { padding: 14px 16px; border-right: 1px solid #e3e8e9; display: grid; gap: 5px; }
.state-strip > div:last-child { border-right: 0; }
.state-strip span { color: #718080; font-size: 11px; }.state-strip strong { font-size: 19px; color: #315b72; }.state-strip strong.hot { color: #b03a34; }
.state-strip small { color: #9aa5a5; font-size: 10px; }.basis-name { font-size: 15px !important; }
.panel { background: white; border: 1px solid #dae1e2; padding: 16px 18px; }
.panel h3 { margin: 0 0 4px; font-size: 15px; }
.hint { color: #7a8886; font-size: 11px; margin: 0 0 12px; }
.form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0; }
.dispatch-grid { grid-template-columns: repeat(5, 1fr); }
.req { margin-bottom: 10px; }
.form-actions { display: flex; align-items: center; gap: 14px; }
.message { color: #a33a35; font-size: 12px; }
.restore-panel.locked { background: #fcf6f5; }
.restore-grid { grid-template-columns: 230px 1fr auto; align-items: center; }
.locked-note { color: #a33a35; font-size: 12px; margin: 4px 0 0; }
:deep(.v-table) { background: transparent; }
tr.blocked { background: #fcf0ef; color: #8a5a57; }
tr.activeRow { box-shadow: inset 2px 0 #c69c3f; }
.link-note, .time-cell small, .req-cell small { color: #8a9796; font-size: 10px; margin-top: 3px; }
.time-cell, .basis-cell, .req-cell { font-size: 12px; vertical-align: top; }
.basis-cell { max-width: 260px; }
.blocked-text { display: block; color: #a33a35 !important; margin-top: 4px; }
.query-grid { grid-template-columns: 260px 1fr; align-items: center; margin: 0; }
.query-result { font-size: 13px; color: #40514f; }.query-result strong { color: #315b72; font-size: 16px; }.query-result strong.hot { color: #b03a34; }
.query-result small { display: block; color: #8a9796; font-size: 11px; margin-top: 4px; }
.correction-card { padding: 6px 8px; }
</style>
