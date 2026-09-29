<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTrackStore } from '../stores/track'
import type { RectificationAction, RecordSource } from '../types'
import { formatTime, fromLocalInput, toLocalInput } from '../utils/time'

type Method = RectificationAction['method']

const route = useRoute()
const store = useTrackStore()
const selectedId = ref(String(route.params.id || store.defects[0]?.id || ''))
const message = ref('')
const tabs = ['处置', '复测', '改派纠错'] as const
type Tab = typeof tabs[number]
const activeTab = ref<Tab>('处置')

const action = reactive({
  method: '捣固' as Method,
  note: '',
  operator: '李海',
  source: '实时采集' as RecordSource,
  evidenceNo: '',
  collectedAt: toLocalInput()
})
const retest = reactive({
  round: 1,
  measuredValue: 0,
  tester: '王磊',
  note: '',
  source: '实时采集' as RecordSource,
  evidenceNo: '',
  collectedAt: toLocalInput()
})
const reassignForm = reactive({
  owner: '工务二工区',
  requirement: '',
  operator: '调度员 方林',
  source: '实时采集' as RecordSource,
  evidenceNo: '',
  collectedAt: toLocalInput(),
  reason: ''
})
const correction = reactive({
  formalSpeed: 160,
  temporarySpeed: 100,
  requirement: '',
  operator: '安全科 何敏',
  source: '实时采集' as RecordSource,
  evidenceNo: '',
  collectedAt: toLocalInput(),
  reason: ''
})

const defect = computed(() => store.defects.find((item) => item.id === selectedId.value))
const effectiveSpeed = computed(() => defect.value ? store.effectiveEventForDefect(defect.value.id) : undefined)
const projection = computed(() => defect.value ? store.speedForSegment(defect.value.segmentId) : undefined)
const defectSpeedEvents = computed(() => defect.value
  ? store.speedEvents.filter((event) => event.defectId === defect.value?.id).sort((a, b) => b.version - a.version || b.collectedAt.localeCompare(a.collectedAt))
  : [])
const remainingLevelOne = computed(() => projection.value?.activeDefectIds.length ?? 0)

watch(defect, (value) => {
  message.value = ''
  if (!value) return
  retest.round = value.retests.length + 1
  retest.measuredValue = value.limit
  correction.formalSpeed = effectiveSpeed.value?.formalSpeed ?? projection.value?.baselineSpeed ?? 160
  correction.temporarySpeed = effectiveSpeed.value?.temporarySpeed ?? 100
  correction.requirement = value.requirement
  reassignForm.requirement = value.requirement
}, { immediate: true })

function submitAction() {
  if (!defect.value) return
  const result = store.addAction(defect.value.id, {
    method: action.method,
    note: action.note,
    operator: action.operator,
    source: action.source,
    evidenceNo: action.evidenceNo,
    recordedAt: fromLocalInput(action.collectedAt),
    receivedAt: new Date().toISOString()
  })
  message.value = result.message
  if (result.ok) action.note = action.evidenceNo = ''
}

function submitRetest() {
  if (!defect.value) return
  const passed = retest.measuredValue <= defect.value.limit
  const result = store.addRetest(defect.value.id, {
    round: retest.round,
    passed,
    measuredValue: retest.measuredValue,
    limit: defect.value.limit,
    note: retest.note || (passed ? '复测合格' : '仍超过限值'),
    tester: retest.tester,
    source: retest.source,
    evidenceNo: retest.evidenceNo,
    testedAt: fromLocalInput(retest.collectedAt),
    receivedAt: new Date().toISOString()
  })
  message.value = result.message
  if (result.ok) retest.note = retest.evidenceNo = ''
}

function submitReassign() {
  if (!defect.value) return
  const result = store.reassign(defect.value.id, {
    ...reassignForm,
    collectedAt: fromLocalInput(reassignForm.collectedAt)
  })
  message.value = result.message
  if (result.ok) reassignForm.reason = reassignForm.evidenceNo = ''
}

function submitCorrection() {
  if (!defect.value) return
  const result = store.correctSpeed(defect.value.id, {
    ...correction,
    collectedAt: fromLocalInput(correction.collectedAt)
  })
  message.value = result.message
  if (result.ok) correction.reason = correction.evidenceNo = ''
}
</script>

<template>
  <section class="page">
    <div class="work-layout">
      <div class="work-list">
        <button v-for="item in store.defects" :key="item.id" :class="{ active: item.id === selectedId }" @click="selectedId = item.id">
          <span>{{ item.id }} · V{{ item.version }}</span><strong>{{ item.type }}超限 · {{ item.severity }}</strong><small>{{ item.owner }} · {{ item.status }}</small>
        </button>
      </div>
      <div v-if="defect" class="work-main">
        <div class="section-head">
          <div><span>{{ defect.segmentId }} · K{{ Math.floor(defect.mileage / 1000) }}+{{ String(defect.mileage % 1000).padStart(3, '0') }}</span><h2>{{ defect.type }}缺陷整治</h2><p>{{ defect.measuredValue }} / 限值 {{ defect.limit }} · {{ defect.severity }} · {{ defect.status }}</p></div>
          <v-chip :color="defect.status === '已关闭' ? 'success' : 'warning'">{{ defect.status }}</v-chip>
        </div>
        <div class="speed-summary">
          <div><span>当前工区要求</span><strong>{{ defect.requirement || '未登记' }}</strong></div>
          <div><span>生效正式限速</span><strong>{{ effectiveSpeed?.formalSpeed ?? projection?.baselineSpeed ?? '—' }} km/h</strong></div>
          <div><span>生效临时限速</span><strong>{{ defect.severity === '一级' && defect.status !== '已关闭' ? `${effectiveSpeed?.temporarySpeed ?? '缺依据'} km/h` : '不适用' }}</strong></div>
          <div><span>区段未关闭一级</span><strong>{{ remainingLevelOne }} 项</strong></div>
        </div>
        <div class="offline-band"><strong>依据采集</strong><span>复测、改派和晚到补录均保留采集时间、接收时间、来源和单据号；先采集先生效，后到内容不覆盖已生效记录。</span></div>
        <div class="tabs"><button v-for="tab in tabs" :key="tab" :class="{ active: activeTab === tab }" @click="activeTab = tab">{{ tab }}</button></div>
        <div v-if="message" class="validation-message">{{ message }}</div>

        <div v-if="activeTab === '处置'" class="form-grid action-grid">
          <v-select v-model="action.method" :items="['打磨', '捣固', '更换', '垫板调整', '测量复核']" label="整治方式" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="action.note" label="现场记录" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="action.operator" label="操作人" density="compact" variant="outlined" hide-details />
          <v-select v-model="action.source" :items="['实时采集', '晚到补录']" label="来源" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="action.evidenceNo" label="现场依据单号" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="action.collectedAt" type="datetime-local" label="采集时间" density="compact" variant="outlined" hide-details />
          <v-btn color="primary" :disabled="!action.note || !action.evidenceNo" @click="submitAction">保存{{ defect.status === '已关闭' ? '晚到' : '' }}整治依据</v-btn>
        </div>

        <div v-if="activeTab === '复测'" class="form-grid retest-grid">
          <v-text-field v-model.number="retest.round" type="number" label="复测轮次" density="compact" variant="outlined" hide-details />
          <v-text-field v-model.number="retest.measuredValue" type="number" label="复测值" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="retest.tester" label="复测人" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="retest.note" label="复测说明" density="compact" variant="outlined" hide-details />
          <v-select v-model="retest.source" :items="['实时采集', '晚到补录']" label="来源" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="retest.evidenceNo" label="复测依据单号" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="retest.collectedAt" type="datetime-local" label="采集时间" density="compact" variant="outlined" hide-details />
          <v-btn color="secondary" :disabled="!retest.evidenceNo" @click="submitRetest">保存{{ defect.status === '已关闭' ? '晚到' : '' }}复测依据</v-btn>
        </div>
        <div v-if="activeTab === '复测'" class="rule-note">复测合格会自动判断：若同区段还有其他一级缺陷，仅关闭本缺陷并保持临时限速；最后一个关闭才恢复整治前速度。</div>

        <div v-if="activeTab === '改派纠错'" class="two-forms">
          <div class="subform">
            <h3>改派留痕</h3>
            <v-text-field v-model="reassignForm.owner" label="新责任工区" density="compact" variant="outlined" hide-details />
            <v-text-field v-model="reassignForm.requirement" label="新工区要求" density="compact" variant="outlined" hide-details />
            <v-text-field v-model="reassignForm.operator" label="改派人" density="compact" variant="outlined" hide-details />
            <v-select v-model="reassignForm.source" :items="['实时采集', '晚到补录']" label="来源" density="compact" variant="outlined" hide-details />
            <v-text-field v-model="reassignForm.evidenceNo" label="改派单号" density="compact" variant="outlined" hide-details />
            <v-text-field v-model="reassignForm.collectedAt" type="datetime-local" label="采集时间" density="compact" variant="outlined" hide-details />
            <v-text-field v-model="reassignForm.reason" label="改派原因" density="compact" variant="outlined" hide-details />
            <v-btn variant="outlined" :disabled="!reassignForm.evidenceNo || !reassignForm.reason || defect.status === '已关闭'" @click="submitReassign">另存改派版本</v-btn>
          </div>
          <div class="subform">
            <h3>限速纠错</h3>
            <v-text-field v-model.number="correction.formalSpeed" type="number" label="正式限速" suffix="km/h" density="compact" variant="outlined" hide-details />
            <v-text-field v-model.number="correction.temporarySpeed" type="number" label="临时限速" suffix="km/h" density="compact" variant="outlined" hide-details :disabled="defect.severity !== '一级'" />
            <v-text-field v-model="correction.requirement" label="工区要求" density="compact" variant="outlined" hide-details />
            <v-text-field v-model="correction.operator" label="纠错人" density="compact" variant="outlined" hide-details />
            <v-select v-model="correction.source" :items="['实时采集', '晚到补录']" label="来源" density="compact" variant="outlined" hide-details />
            <v-text-field v-model="correction.evidenceNo" label="纠错单号" density="compact" variant="outlined" hide-details />
            <v-text-field v-model="correction.collectedAt" type="datetime-local" label="采集时间" density="compact" variant="outlined" hide-details />
            <v-text-field v-model="correction.reason" label="纠错原因" density="compact" variant="outlined" hide-details />
            <v-btn color="secondary" :disabled="!correction.evidenceNo || !correction.reason || defect.status === '已关闭'" @click="submitCorrection">另存纠错版本</v-btn>
          </div>
        </div>

        <div class="two-column">
          <div>
            <h3>整治记录（原始依据不可覆盖）</h3>
            <div v-for="item in defect.actions" :key="`${item.recordedAt}-${item.evidenceNo}`" class="record-item">
              <strong>{{ item.method }} · {{ item.source }}</strong><span>{{ item.note }}</span><small>{{ item.operator }} · 采集 {{ formatTime(item.recordedAt) }} · 接收 {{ formatTime(item.receivedAt) }} · {{ item.evidenceNo }}</small>
            </div>
          </div>
          <div>
            <h3>复测轮次</h3>
            <div v-for="item in defect.retests" :key="`${item.round}-${item.evidenceNo}`" class="record-item">
              <strong>第{{ item.round }}轮 {{ item.passed ? '通过' : '未通过' }} · {{ item.source }}</strong><span>{{ item.measuredValue }} / {{ item.limit }}</span><small>{{ item.tester }} · {{ item.note }} · 采集 {{ formatTime(item.testedAt) }} · {{ item.evidenceNo }}</small>
            </div>
          </div>
        </div>
        <h3>限速版本链</h3>
        <v-table density="compact">
          <thead><tr><th>版本</th><th>类型</th><th>正式/临时</th><th>要求</th><th>依据与时间</th></tr></thead>
          <tbody>
            <tr v-for="event in defectSpeedEvents" :key="event.id">
              <td>V{{ event.version }}</td><td>{{ event.type }}</td><td>{{ event.formalSpeed }} / {{ event.temporarySpeed ?? '—' }}</td>
              <td>{{ event.requirement }}<small>{{ event.note }}</small></td><td>{{ event.evidenceNo }}<small>{{ event.source }} · 采集 {{ formatTime(event.collectedAt) }} · 接收 {{ formatTime(event.receivedAt) }}</small></td>
            </tr>
          </tbody>
        </v-table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.work-layout { display: grid; grid-template-columns: 300px 1fr; gap: 14px; align-items: start; }
.work-list { display: grid; gap: 8px; }
.work-list button { border: 1px solid #dae1e2; background: white; padding: 13px; text-align: left; display: grid; gap: 6px; cursor: pointer; }
.work-list button.active { border-color: #315b72; box-shadow: inset 3px 0 #315b72; }
.work-list span, .work-list small { color: #738180; font-size: 11px; }
.work-main { background: white; border: 1px solid #dae1e2; padding: 18px; }
.section-head { display: flex; justify-content: space-between; margin-bottom: 14px; }.section-head span { color: #71807e; font-size: 11px; }.section-head h2 { margin: 4px 0; }.section-head p { margin: 0; color: #667573; }
.speed-summary { display: grid; grid-template-columns: 1.4fr repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }.speed-summary div { background: #f4f7f7; padding: 11px; }.speed-summary span { display: block; color: #758280; font-size: 10px; margin-bottom: 5px; }.speed-summary strong { font-size: 13px; color: #315b72; }
.offline-band { display: flex; gap: 14px; padding: 11px; border-left: 3px solid #b08735; background: #fbf6e9; font-size: 12px; }.offline-band span { color: #736d5b; }
.tabs { display: flex; gap: 6px; margin: 14px 0 10px; }.tabs button { border: 1px solid #d4ddde; background: #f8fafa; padding: 7px 18px; cursor: pointer; }.tabs button.active { background: #315b72; color: white; border-color: #315b72; }
.form-grid { display: grid; gap: 9px; margin: 12px 0; }.action-grid { grid-template-columns: 130px 1fr 120px 120px 160px 190px auto; }.retest-grid { grid-template-columns: 100px 110px 120px 1fr 120px 160px 190px auto; }
.two-forms { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }.subform { display: grid; gap: 9px; padding: 13px; background: #f7f9f9; border: 1px solid #e0e6e7; }.subform h3 { margin: 0 0 4px; font-size: 14px; }
.rule-note { color: #70552b; background: #fbf6e9; padding: 9px 11px; font-size: 12px; }
.validation-message { color: #a63e38; font-size: 12px; margin-bottom: 10px; }
.two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 18px 0; }.two-column h3, h3 { font-size: 14px; }
.record-item { border-top: 1px solid #e2e7e7; padding: 10px 0; display: grid; gap: 4px; }.record-item span, .record-item small { color: #6d7b79; font-size: 11px; }
td small { display: block; color: #7b8786; font-size: 10px; margin-top: 3px; }
</style>
