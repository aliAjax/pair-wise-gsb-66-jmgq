<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useTrackStore } from '../stores/track'
import { fromLocalInput, toLocalInput } from '../domain/speed'

const route = useRoute()
const store = useTrackStore()
const selectedId = ref(String(route.params.id || store.defects[0]?.id || ''))
const defect = computed(() => store.defects.find((item) => item.id === selectedId.value))
const segment = computed(() => store.segments.find((item) => item.id === defect.value?.segmentId))
const liveSpeed = computed(() => defect.value ? store.segmentSpeed(defect.value.segmentId) : undefined)
const action = reactive({ method: '捣固', note: '', operator: '李海', basis: '', collectedAt: toLocalInput(new Date().toISOString()) })
const retest = reactive({ measuredValue: 0, tester: '王磊', note: '', basis: '', collectedAt: toLocalInput(new Date().toISOString()) })
const reassignment = reactive({ owner: '工务二工区', basis: '', collectedAt: toLocalInput(new Date().toISOString()) })
const message = ref('')

function addAction() {
  if (!defect.value || !action.note) return
  store.addAction(defect.value.id, {
    ...action, method: action.method as any,
    recordedAt: fromLocalInput(action.collectedAt), basis: action.basis.trim() || undefined
  })
  action.note = ''
  action.basis = ''
  message.value = '整治记录已提交，采集时间与依据已留存'
}

function addRetest() {
  if (!defect.value || !retest.basis.trim()) {
    message.value = '复测必须填写依据（仪器/报告编号）'
    return
  }
  const round = defect.value.retests.length + 1
  const passed = retest.measuredValue <= defect.value.limit
  const result = store.addRetest(defect.value.id, {
    round, passed, measuredValue: retest.measuredValue, limit: defect.value.limit,
    note: retest.note || (passed ? '复测合格' : '仍超过限值'),
    tester: retest.tester, testedAt: fromLocalInput(retest.collectedAt),
    basis: retest.basis
  })
  message.value = result?.message ?? ''
  retest.note = ''
  retest.basis = ''
}

function reassign() {
  if (!defect.value) return
  const result = store.reassign(defect.value.id, reassignment.owner, reassignment.basis, fromLocalInput(reassignment.collectedAt))
  message.value = result.message
  if (result.ok) reassignment.basis = ''
}

function closeDefect() {
  if (!defect.value) return
  const result = store.transition(defect.value.id, '已关闭')
  message.value = result.message
}
</script>

<template>
  <section class="page">
    <div class="work-layout">
      <div class="work-list">
        <button v-for="item in store.defects" :key="item.id" :class="{ active: item.id === selectedId }" @click="selectedId = item.id">
          <span>{{ item.id }} · V{{ item.version }}</span><strong>{{ item.type }}超限</strong><small>{{ item.owner }} · {{ item.status }}</small>
        </button>
      </div>
      <div v-if="defect" class="work-main">
        <div class="section-head">
          <div><span>{{ defect.segmentId }} · K{{ Math.floor(defect.mileage / 1000) }}+{{ String(defect.mileage % 1000).padStart(3, '0') }}</span><h2>{{ defect.type }}缺陷整治</h2><p>{{ defect.measuredValue }} / 限值 {{ defect.limit }} · {{ defect.severity }} · {{ defect.status }}</p></div>
          <div class="head-side"><v-chip :color="defect.status === '已关闭' ? 'success' : 'warning'">{{ defect.status }}</v-chip>
            <v-chip v-if="liveSpeed?.temporarySpeed" color="error" class="speed-chip">当前限速 {{ liveSpeed.temporarySpeed }} km/h</v-chip>
            <v-chip v-else color="success" class="speed-chip">整治前速度 {{ segment?.speedLimit }} km/h</v-chip>
          </div>
        </div>
        <div class="offline-band"><strong>晚到补录留依据</strong><span>采集时间按现场实际填写，录入时间由系统记录；后到内容不能覆盖已生效记录，只追加留档。</span></div>

        <div class="action-form">
          <v-select v-model="action.method" :items="['打磨', '捣固', '更换', '垫板调整', '测量复核']" label="整治方式" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="action.note" label="现场记录" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="action.operator" label="操作人" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="action.basis" label="依据：单据/照片编号" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="action.collectedAt" type="datetime-local" label="采集时间（补录可填更早时间）" density="compact" variant="outlined" hide-details />
          <v-btn color="primary" :disabled="!action.note" @click="addAction">提交整治记录</v-btn>
        </div>
        <div class="action-form">
          <v-text-field v-model.number="retest.measuredValue" type="number" label="复测值" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="retest.tester" label="复测人" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="retest.basis" label="依据：仪器/复测报告编号（必填）" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="retest.collectedAt" type="datetime-local" label="复测采集时间" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="retest.note" label="复测说明" density="compact" variant="outlined" hide-details />
          <v-btn color="secondary" @click="addRetest">提交复测</v-btn>
        </div>

        <div class="reassign-row">
          <v-select v-model="reassignment.owner" :items="['工务一工区', '工务二工区', '桥隧工区']" label="改派至" density="compact" variant="outlined" hide-details style="max-width:170px" />
          <v-text-field v-model="reassignment.basis" label="改派依据：命令编号/原因（必填）" density="compact" variant="outlined" hide-details />
          <v-text-field v-model="reassignment.collectedAt" type="datetime-local" label="改派采集时间" density="compact" variant="outlined" hide-details style="max-width:230px" />
          <v-btn variant="outlined" :disabled="defect.status === '已关闭'" @click="reassign">改派（留依据、限速不变）</v-btn>
        </div>

        <div v-if="message" class="validation-message">{{ message }}</div>
        <div class="two-column">
          <div><h3>整治记录</h3><div v-for="item in defect.actions" :key="item.recordedAt + item.note" class="record-item"><strong>{{ item.method }}</strong><span>{{ item.note }}</span><small>{{ item.operator }} · 采集 {{ item.recordedAt.replace('T', ' ').slice(0, 16) }}<template v-if="item.receivedAt"> · 录入 {{ item.receivedAt.replace('T', ' ').slice(0, 16) }}</template></small><small v-if="item.basis" class="basis">依据：{{ item.basis }}</small></div></div>
          <div><h3>复测轮次</h3><div v-for="item in defect.retests" :key="item.round + item.testedAt" class="record-item"><strong>第{{ item.round }}轮 {{ item.passed ? '通过' : '未通过' }}</strong><span>{{ item.measuredValue }} / {{ item.limit }}</span><small>{{ item.tester }} · {{ item.note }}</small><small>采集 {{ item.testedAt.replace('T', ' ').slice(0, 16) }}<template v-if="item.receivedAt"> · 录入 {{ item.receivedAt.replace('T', ' ').slice(0, 16) }}</template></small><small v-if="item.basis" class="basis">依据：{{ item.basis }}</small><small v-if="item.passed && defect.severity === '一级'" class="speed-note">一级缺陷：仅当同区段全部一级缺陷关闭时才恢复常速</small></div></div>
        </div>
        <v-btn variant="outlined" @click="closeDefect">申请关闭缺陷</v-btn>
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
.head-side { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }.speed-chip { font-size: 11px; }
.offline-band { display: flex; justify-content: space-between; gap: 14px; padding: 11px; border-left: 3px solid #b08735; background: #fbf6e9; font-size: 12px; }.offline-band span { color: #736d5b; }
.action-form { display: grid; grid-template-columns: 130px 1fr 110px 1fr 210px auto; gap: 10px; margin: 13px 0; align-items: center; }
.reassign-row { display: grid; grid-template-columns: 170px 1fr 230px auto; gap: 10px; align-items: center; padding: 10px; background: #f4f7f7; margin-bottom: 10px; }
.validation-message { color: #a63e38; font-size: 12px; margin-bottom: 10px; }
.two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 18px 0; }.two-column h3 { font-size: 14px; }
.record-item { border-top: 1px solid #e2e7e7; padding: 10px 0; display: grid; gap: 4px; }.record-item span, .record-item small { color: #6d7b79; font-size: 11px; }
.record-item .basis { color: #8c6a2f; }.record-item .speed-note { color: #a33a35; }
</style>
