<script setup lang="ts">
import { computed, ref } from 'vue'
import MileageCanvas from '../components/MileageCanvas.vue'
import { useTrackStore } from '../stores/track'
import type { SpeedEvent } from '../types'
import { formatTime } from '../utils/time'

const store = useTrackStore()
const segmentDefects = computed(() => store.defects.filter((item) => item.segmentId === store.selectedSegmentId))
const projection = computed(() => store.selectedSegment ? store.speedForSegment(store.selectedSegment.id) : undefined)
const ledger = ref<'全部' | '派工' | '改派' | '纠错' | '恢复'>('全部')
const segmentEvents = computed(() => store.speedEvents
  .filter((event) => event.segmentId === store.selectedSegmentId && (ledger.value === '全部' || event.type === ledger.value))
  .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)))

function eventStatus(event: SpeedEvent) {
  const defect = store.defects.find((item) => item.id === event.defectId)
  if (!defect) return '缺陷已删除'
  if (event.type === '恢复') return defect.status === '已关闭' ? '恢复命令' : '恢复待校验'
  const effective = store.effectiveEventForDefect(event.defectId)
  if (defect.severity !== '一级' || defect.status === '已关闭') return '历史版本'
  return effective?.id === event.id ? `生效 V${event.version}` : '历史版本'
}
</script>

<template>
  <section class="page">
    <div class="split">
      <div class="segment-list">
        <button v-for="segment in store.segments" :key="segment.id" :class="{ active: segment.id === store.selectedSegmentId }" @click="store.selectedSegmentId = segment.id">
          <span>{{ segment.id }} · V{{ segment.version }}</span><strong>{{ segment.line }}</strong><small>K{{ Math.floor(segment.startMileage / 1000) }}+{{ String(segment.startMileage % 1000).padStart(3, '0') }} - K{{ Math.floor(segment.endMileage / 1000) }}+{{ String(segment.endMileage % 1000).padStart(3, '0') }}</small>
        </button>
      </div>
      <div v-if="store.selectedSegment && projection" class="track-main">
        <div class="section-head">
          <div><span>{{ store.selectedSegment.id }}</span><h2>{{ store.selectedSegment.line }}</h2><p>整治前正式速度 {{ projection.baselineSpeed }} km/h</p></div>
          <v-chip :color="projection.restored ? 'success' : 'error'">{{ projection.restored ? '已恢复原速' : `临时限速 ${projection.temporarySpeed ?? '缺依据'} km/h` }}</v-chip>
        </div>
        <MileageCanvas :segment="store.selectedSegment" :defects="segmentDefects" />
        <div class="speed-judgement" :class="{ alert: !projection.restored }">
          <div><strong>区段限速判断（由台账自动投影）</strong><p>正式限速取所有生效处置中的当前正式值；临时限速取未关闭一级缺陷的最低值。</p></div>
          <div class="speed-numbers"><span>整治前速度</span><strong>{{ projection.baselineSpeed }}</strong><small>km/h</small></div>
          <div class="speed-numbers"><span>当前正式限速</span><strong>{{ projection.formalSpeed }}</strong><small>km/h</small></div>
          <div class="speed-numbers"><span>当前执行限速</span><strong>{{ projection.restored ? projection.baselineSpeed : projection.temporarySpeed ?? '—' }}</strong><small>km/h</small></div>
          <div class="speed-numbers"><span>未关闭一级</span><strong>{{ projection.activeDefectIds.length }}</strong><small>项</small></div>
        </div>
        <div v-if="!projection.restored" class="rule-band">未关闭一级缺陷未清零，复测通过也不会恢复；只剩最后一个关闭时才自动生成恢复命令。</div>
        <div v-if="projection.missingEvidence" class="rule-band danger">存在一级缺陷缺少派工/临时限速依据，应补录正式派工单。</div>
        <div class="ledger-head">
          <h3>限速处置台账</h3>
          <v-btn-toggle v-model="ledger" density="compact" variant="outlined" mandatory>
            <v-btn value="全部" size="small">全部</v-btn><v-btn value="派工" size="small">派工</v-btn><v-btn value="改派" size="small">改派</v-btn><v-btn value="纠错" size="small">纠错</v-btn><v-btn value="恢复" size="small">恢复</v-btn>
          </v-btn-toggle>
        </div>
        <v-table density="compact">
          <thead><tr><th>采集时间</th><th>缺陷</th><th>类型</th><th>版本</th><th>正式/临时</th><th>工区要求</th><th>依据</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="event in segmentEvents" :key="event.id">
              <td>{{ formatTime(event.collectedAt) }}<small v-if="event.source === '晚到补录'">晚到：{{ formatTime(event.receivedAt) }}</small></td>
              <td>{{ event.defectId }}<small>{{ event.owner }}</small></td>
              <td>{{ event.type }}</td><td>V{{ event.version }}</td>
              <td>{{ event.formalSpeed }} / {{ event.temporarySpeed ?? '—' }}</td>
              <td>{{ event.requirement }}<small>{{ event.note }}</small></td>
              <td>{{ event.evidenceNo }}<small>{{ event.operator }}</small></td>
              <td>{{ eventStatus(event) }}</td>
            </tr>
          </tbody>
        </v-table>
        <h3>关联缺陷</h3>
        <v-table density="compact">
          <thead><tr><th>关联缺陷</th><th>里程</th><th>类型</th><th>严重度</th><th>状态</th><th>责任工区</th></tr></thead>
          <tbody><tr v-for="item in segmentDefects" :key="item.id"><td>{{ item.id }}</td><td>K{{ Math.floor(item.mileage / 1000) }}+{{ String(item.mileage % 1000).padStart(3, '0') }}</td><td>{{ item.type }}</td><td>{{ item.severity }}</td><td>{{ item.status }}</td><td>{{ item.owner }}</td></tr></tbody>
        </v-table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.split { display: grid; grid-template-columns: 300px 1fr; gap: 14px; align-items: start; }
.segment-list { display: grid; gap: 8px; }
.segment-list button { background: white; border: 1px solid #dae1e2; padding: 13px; text-align: left; display: grid; gap: 6px; cursor: pointer; border-radius: 4px; }
.segment-list button.active { border-color: #315b72; box-shadow: inset 3px 0 #315b72; }
.segment-list span, .segment-list small { color: #748180; font-size: 11px; }
.track-main { background: white; border: 1px solid #dae1e2; padding: 18px; }
.section-head { display: flex; justify-content: space-between; margin-bottom: 14px; }
.section-head span { color: #31807e; font-size: 11px; }.section-head h2 { margin: 4px 0; font-size: 20px; }.section-head p { margin: 0; color: #60706f; }
.speed-judgement { display: grid; grid-template-columns: 1.6fr repeat(4, .55fr); gap: 12px; align-items: center; margin: 14px 0; padding: 14px; background: #edf7f2; border-left: 4px solid #43876b; }.speed-judgement.alert { background: #fdf2e8; border-left-color: #c0792e; }.speed-judgement p { margin: 5px 0 0; color: #687775; font-size: 11px; }
.speed-numbers { display: grid; gap: 2px; }.speed-numbers span, .speed-numbers small { color: #748180; font-size: 10px; }.speed-numbers strong { font-size: 25px; color: #315b72; }
.rule-band { padding: 10px 12px; margin-bottom: 12px; color: #8a5a21; background: #fbf3e6; border-left: 3px solid #c69c3f; font-size: 12px; }.rule-band.danger { color: #9b3b35; background: #fbecea; border-left-color: #b84239; }
.ledger-head { display: flex; justify-content: space-between; align-items: center; margin-top: 15px; }.ledger-head h3 { margin: 0; font-size: 15px; }
td small { display: block; color: #7b8786; font-size: 10px; margin-top: 3px; }
</style>
