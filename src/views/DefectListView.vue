<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery } from '@vue/apollo-composable'
import { gql } from '@apollo/client/core'
import { useTrackStore } from '../stores/track'
import type { DefectStatus, RecordSource } from '../types'
import { fromLocalInput, toLocalInput } from '../utils/time'

const store = useTrackStore()
const router = useRouter()
const TrackSegments = gql`query TrackSegments { segments { id line startMileage endMileage speedLimit version } }`
const { result: segmentResult, loading } = useQuery(TrackSegments)
const selected = ref<string[]>([])
const message = ref('')
const dispatch = reactive({
  owner: '工务一工区',
  requirement: '',
  formalSpeed: 160,
  temporarySpeed: 100,
  source: '实时采集' as RecordSource,
  evidenceNo: '',
  collectedAt: toLocalInput(),
  operator: '调度员 方林'
})

const headers = [
  { title: '缺陷编号', key: 'id' },
  { title: '区段', key: 'segmentId' },
  { title: '里程', key: 'mileage' },
  { title: '类型', key: 'type' },
  { title: '严重度', key: 'severity' },
  { title: '实测/限值', key: 'value' },
  { title: '状态', key: 'status' },
  { title: '责任工区', key: 'owner' },
  { title: '当前限速', key: 'speed' },
  { title: '版本', key: 'version' },
  { title: '', key: 'actions' }
]
const statuses: Array<DefectStatus | '全部'> = ['全部', '待派工', '整治中', '待复测', '复测不合格', '已关闭']
const selectedDefects = computed(() => store.defects.filter((item) => selected.value.includes(item.id)))
const selectedLevelOne = computed(() => selectedDefects.value.filter((item) => item.severity === '一级' && item.status !== '已关闭'))
const hasExistingDispatch = computed(() => selectedDefects.value.some((item) => store.effectiveEventForDefect(item.id)))
const projected = computed(() => Object.fromEntries(store.segments.map((segment) => [segment.id, store.speedForSegment(segment.id)])))
const restrictedSegments = computed(() => store.segments.filter((segment) => projected.value[segment.id]?.activeDefectIds.length))

watch(selected, (ids) => {
  const first = store.defects.find((item) => item.id === ids[0])
  const projection = first ? projected.value[first.segmentId] : undefined
  if (first) {
    dispatch.formalSpeed = projection?.formalSpeed ?? 160
    dispatch.temporarySpeed = projection?.temporarySpeed ?? 100
  }
})

function assign() {
  const result = store.assign(selected.value, {
    ...dispatch,
    collectedAt: fromLocalInput(dispatch.collectedAt)
  })
  message.value = result.message
  if (result.ok) selected.value = []
}
</script>

<template>
  <section class="page">
    <div class="metrics">
      <article><span>超限缺陷</span><strong>{{ store.defects.length }}</strong><small>含已关闭项</small></article>
      <article><span>未关闭一级</span><strong>{{ store.defects.filter((item) => item.severity === '一级' && item.status !== '已关闭').length }}</strong><small>存在时不得恢复原速</small></article>
      <article><span>限速中区段</span><strong>{{ restrictedSegments.length }}</strong><small>按最严临时限速执行</small></article>
      <article><span>处置依据</span><strong>{{ store.speedEvents.length }}</strong><small>派工/改派/纠错/恢复</small></article>
    </div>
    <div class="dispatch-panel">
      <div class="dispatch-title"><strong>派工限速处置</strong><span>派工单同时保存正式限速、一级缺陷临时限速和工区要求；晚到补录保留采集时间。</span></div>
      <v-select v-model="dispatch.owner" :items="['工务一工区', '工务二工区', '桥隧工区']" label="责任工区" density="compact" variant="outlined" hide-details />
      <v-text-field v-model="dispatch.requirement" label="工区要求" density="compact" variant="outlined" hide-details />
      <v-text-field v-model.number="dispatch.formalSpeed" type="number" label="正式限速" suffix="km/h" density="compact" variant="outlined" hide-details />
      <v-text-field v-model.number="dispatch.temporarySpeed" type="number" label="临时限速" suffix="km/h" density="compact" variant="outlined" hide-details :disabled="!selectedLevelOne.length" />
      <v-select v-model="dispatch.source" :items="['实时采集', '晚到补录']" label="来源" density="compact" variant="outlined" hide-details />
      <v-text-field v-model="dispatch.evidenceNo" label="派工依据单号" density="compact" variant="outlined" hide-details />
      <v-text-field v-model="dispatch.collectedAt" type="datetime-local" label="采集时间" density="compact" variant="outlined" hide-details />
      <v-text-field v-model="dispatch.operator" label="调度人" density="compact" variant="outlined" hide-details />
      <v-btn color="primary" :disabled="!selected.length || hasExistingDispatch" @click="assign">派工 {{ selected.length ? `(${selected.length})` : '' }}</v-btn>
    </div>
    <div v-if="selectedLevelOne.length" class="rule-band warn">已选 {{ selectedLevelOne.length }} 个一级缺陷，必须登记低于正式限速的临时限速；任一未关闭时区段不得恢复。</div>
    <div v-else-if="selected.length" class="rule-band">已选 {{ selected.length }} 个非一级缺陷，可登记正式限速与工区要求。</div>
    <div v-if="message" class="validation-message">{{ message }}</div>
    <div class="toolbar">
      <v-text-field v-model="store.keyword" density="compact" variant="outlined" hide-details prepend-inner-icon="mdi-magnify" placeholder="搜索缺陷、区段、类型或工区" />
      <v-select v-model="store.status" :items="statuses" density="compact" variant="outlined" hide-details />
    </div>
    <div class="query-band"><span>{{ loading ? 'GraphQL数据读取中' : `GraphQL已返回${segmentResult?.segments?.length ?? 0}个区段` }}</span><span>资料、判断与页面分离；台账事件不可覆盖</span></div>
    <v-data-table v-model="selected" :headers="headers" :items="store.filtered" item-value="id" show-select density="compact" :items-per-page="12">
      <template #item.value="{ item }">{{ item.measuredValue }} / {{ item.limit }}</template>
      <template #item.severity="{ item }"><v-chip size="small" :color="item.severity === '一级' ? 'error' : item.severity === '二级' ? 'warning' : 'default'">{{ item.severity }}</v-chip></template>
      <template #item.status="{ item }"><v-chip size="small" :color="item.status === '已关闭' ? 'success' : item.status === '复测不合格' ? 'error' : 'warning'">{{ item.status }}</v-chip></template>
      <template #item.mileage="{ item }">K{{ Math.floor(item.mileage / 1000) }}+{{ String(item.mileage % 1000).padStart(3, '0') }}</template>
      <template #item.speed="{ item }">
        <span v-if="item.severity === '一级' && item.status !== '已关闭'">{{ projected[item.segmentId]?.temporarySpeed ?? '缺依据' }} / {{ projected[item.segmentId]?.formalSpeed }} km/h</span>
        <span v-else>{{ projected[item.segmentId]?.restored ? '原速' : '—' }}</span>
      </template>
      <template #item.version="{ item }">V{{ item.version }}</template>
      <template #item.actions="{ item }"><v-btn size="small" variant="text" @click="router.push(`/work-orders/${item.id}`)">处置</v-btn></template>
    </v-data-table>
  </section>
</template>

<style scoped>
.dispatch-panel { display: grid; grid-template-columns: 1.15fr 1.4fr 120px 120px 120px 150px 190px 120px auto; gap: 9px; align-items: center; background: white; border: 1px solid #dae2e3; padding: 13px; margin-bottom: 10px; }
.dispatch-title { display: grid; gap: 4px; padding-right: 10px; }.dispatch-title span { color: #738180; font-size: 10px; line-height: 1.5; }
.rule-band { padding: 9px 12px; margin-bottom: 10px; background: #eef4f6; color: #47616d; font-size: 12px; border-left: 3px solid #315b72; }.rule-band.warn { background: #fbecea; color: #9b3b35; border-left-color: #b84239; }
.query-band { display: flex; justify-content: space-between; font-size: 11px; color: #718080; margin: 0 0 10px; }
.validation-message { color: #a63e38; font-size: 12px; margin-bottom: 10px; }
.toolbar { display: grid; grid-template-columns: minmax(320px, 1fr) 150px; gap: 10px; align-items: center; margin-bottom: 10px; }
</style>
